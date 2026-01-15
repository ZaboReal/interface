# Graph Construction Service for P&ID Diagrams
# Based on Azure P&ID digitization approach:
# 1. Extend lines mathematically to find connection candidates
# 2. Connect line endpoints to nearest symbols
# 3. Handle T-junctions and intersections
# 4. Build NetworkX graph
import networkx as nx
import numpy as np
from typing import List, Dict, Tuple, Optional, Set
from shapely.geometry import LineString, Point, box
from shapely.ops import nearest_points


class GraphConstructionService:
    """
    Constructs connectivity graph from detected symbols and lines.

    Uses line extension algorithm to find connections between
    lines and symbols, even when they don't exactly touch.
    """

    def __init__(
        self,
        connection_threshold: float = 50.0,
        line_extension_buffer: float = 30.0,
        symbol_proximity_threshold: float = 100.0
    ):
        self.connection_threshold = connection_threshold
        self.line_extension_buffer = line_extension_buffer
        self.symbol_proximity_threshold = symbol_proximity_threshold

    def build_graph(
        self,
        symbols: List[Dict],
        lines: List[Dict],
        text_elements: List[Dict] = None,
        image_size: Tuple[int, int] = None
    ) -> nx.DiGraph:
        """
        Build connectivity graph from symbols and lines.

        Args:
            symbols: Detected symbols with bbox, tag, type
            lines: Detected line segments with start/end points
            text_elements: Optional text elements for additional nodes
            image_size: (width, height) for boundary calculations

        Returns:
            NetworkX DiGraph with symbols as nodes and connections as edges
        """
        G = nx.DiGraph()

        # Step 1: Add symbol nodes
        symbol_lookup = {}  # index -> node_id
        for i, symbol in enumerate(symbols):
            node_id = symbol.get("tag") or f"{symbol.get('type', 'unknown')}_{i}"
            symbol_lookup[i] = node_id

            G.add_node(
                node_id,
                type=symbol.get("type", "unknown"),
                tag=symbol.get("tag"),
                label=symbol.get("label", ""),
                bbox=symbol.get("bbox"),
                center=symbol.get("center"),
                confidence=symbol.get("confidence", 0),
                pressure=symbol.get("pressure"),
                temperature=symbol.get("temperature"),
                page_number=symbol.get("page_number", 1),
                node_type="symbol"
            )

        # Step 2: Create line geometries and extend them
        line_geometries = []
        for i, line in enumerate(lines):
            start = line["start"]
            end = line["end"]

            # Create Shapely LineString
            geom = LineString([start, end])

            # Extend line in both directions
            extended_geom = self._extend_line(geom, self.line_extension_buffer)

            line_geometries.append({
                "index": i,
                "original": geom,
                "extended": extended_geom,
                "start": start,
                "end": end,
                "data": line
            })

        # Step 3: Find connections between lines and symbols
        connections = self._find_line_symbol_connections(symbols, line_geometries)

        # Step 4: Find line-to-line connections (T-junctions, etc.)
        line_connections = self._find_line_to_line_connections(line_geometries)

        # Step 5: Build edges from connections
        edges = self._build_edges_from_connections(
            connections, line_connections, symbols, symbol_lookup
        )

        # Add edges to graph
        for source, target, attrs in edges:
            if source in G and target in G:
                G.add_edge(source, target, **attrs)

        # Step 6: Find symbol-to-symbol proximity connections
        proximity_edges = self._find_proximity_connections(symbols, symbol_lookup)
        for source, target, attrs in proximity_edges:
            if source in G and target in G and not G.has_edge(source, target):
                G.add_edge(source, target, **attrs)

        print(f"[GraphConstruction] Built graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
        return G

    def _extend_line(self, line: LineString, buffer: float) -> LineString:
        """
        Extend a line segment in both directions.

        Uses the line equation y = mx + b to extend endpoints.
        """
        coords = list(line.coords)
        if len(coords) < 2:
            return line

        x1, y1 = coords[0]
        x2, y2 = coords[-1]

        # Calculate direction vector
        dx = x2 - x1
        dy = y2 - y1
        length = np.sqrt(dx * dx + dy * dy)

        if length == 0:
            return line

        # Normalize
        dx /= length
        dy /= length

        # Extend both ends
        new_start = (x1 - dx * buffer, y1 - dy * buffer)
        new_end = (x2 + dx * buffer, y2 + dy * buffer)

        return LineString([new_start, new_end])

    def _find_line_symbol_connections(
        self,
        symbols: List[Dict],
        line_geometries: List[Dict]
    ) -> Dict[int, List[Tuple[int, str, float]]]:
        """
        Find which lines connect to which symbols.

        For each line endpoint, find the nearest symbol within threshold.

        Returns:
            Dict mapping line_index -> [(symbol_index, endpoint_type, distance), ...]
        """
        connections = {}

        for line_data in line_geometries:
            line_idx = line_data["index"]
            start = Point(line_data["start"])
            end = Point(line_data["end"])
            extended = line_data["extended"]

            connections[line_idx] = []

            for sym_idx, symbol in enumerate(symbols):
                bbox = symbol.get("bbox", (0, 0, 0, 0))
                x, y, w, h = bbox
                center = Point(symbol.get("center", (x + w // 2, y + h // 2)))

                # Create symbol bounding box with padding
                sym_box = box(x - 5, y - 5, x + w + 5, y + h + 5)

                # Check if extended line intersects symbol
                if extended.intersects(sym_box):
                    # Calculate distance from endpoints to symbol center
                    start_dist = start.distance(center)
                    end_dist = end.distance(center)

                    if start_dist < self.connection_threshold:
                        connections[line_idx].append((sym_idx, "start", start_dist))
                    if end_dist < self.connection_threshold:
                        connections[line_idx].append((sym_idx, "end", end_dist))

                # Also check direct proximity even without intersection
                elif center.distance(start) < self.connection_threshold:
                    connections[line_idx].append((sym_idx, "start", center.distance(start)))
                elif center.distance(end) < self.connection_threshold:
                    connections[line_idx].append((sym_idx, "end", center.distance(end)))

        return connections

    def _find_line_to_line_connections(
        self,
        line_geometries: List[Dict]
    ) -> List[Tuple[int, int, str]]:
        """
        Find connections between lines (T-junctions, intersections).

        Returns:
            List of (line1_idx, line2_idx, connection_type)
        """
        connections = []
        threshold = self.connection_threshold / 2

        for i, line1 in enumerate(line_geometries):
            for j, line2 in enumerate(line_geometries):
                if i >= j:
                    continue

                s1 = Point(line1["start"])
                e1 = Point(line1["end"])
                s2 = Point(line2["start"])
                e2 = Point(line2["end"])

                # Check endpoint connections
                if s1.distance(s2) < threshold:
                    connections.append((i, j, "endpoint"))
                elif s1.distance(e2) < threshold:
                    connections.append((i, j, "endpoint"))
                elif e1.distance(s2) < threshold:
                    connections.append((i, j, "endpoint"))
                elif e1.distance(e2) < threshold:
                    connections.append((i, j, "endpoint"))

                # Check for intersection (T-junction or crossing)
                elif line1["original"].intersects(line2["original"]):
                    connections.append((i, j, "intersection"))

        return connections

    def _build_edges_from_connections(
        self,
        line_symbol_connections: Dict[int, List[Tuple[int, str, float]]],
        line_line_connections: List[Tuple[int, int, str]],
        symbols: List[Dict],
        symbol_lookup: Dict[int, str]
    ) -> List[Tuple[str, str, Dict]]:
        """
        Build graph edges from detected connections.

        For each line, if both endpoints connect to symbols,
        create an edge between those symbols.
        """
        edges = []
        added_edges: Set[Tuple[str, str]] = set()

        for line_idx, connections in line_symbol_connections.items():
            if len(connections) < 2:
                continue

            # Sort by distance to get best connections
            connections.sort(key=lambda x: x[2])

            # Get unique symbols connected by this line
            start_symbols = [(c[0], c[2]) for c in connections if c[1] == "start"]
            end_symbols = [(c[0], c[2]) for c in connections if c[1] == "end"]

            # Connect nearest start symbol to nearest end symbol
            if start_symbols and end_symbols:
                source_idx = start_symbols[0][0]
                target_idx = end_symbols[0][0]

                if source_idx != target_idx:
                    source_id = symbol_lookup[source_idx]
                    target_id = symbol_lookup[target_idx]

                    edge_key = (source_id, target_id)
                    reverse_key = (target_id, source_id)

                    if edge_key not in added_edges and reverse_key not in added_edges:
                        edges.append((
                            source_id,
                            target_id,
                            {
                                "type": "pipe",
                                "line_index": line_idx,
                                "connection_type": "direct"
                            }
                        ))
                        added_edges.add(edge_key)

        # Also handle chains through line-to-line connections
        # Build line connectivity graph
        line_graph = nx.Graph()
        for line_idx in line_symbol_connections.keys():
            line_graph.add_node(line_idx)

        for l1, l2, conn_type in line_line_connections:
            line_graph.add_edge(l1, l2)

        # For each connected component of lines, find terminal symbols
        for component in nx.connected_components(line_graph):
            terminal_symbols = set()
            for line_idx in component:
                for sym_idx, endpoint, dist in line_symbol_connections.get(line_idx, []):
                    terminal_symbols.add(sym_idx)

            # Connect all terminal symbols in this component
            terminal_list = list(terminal_symbols)
            for i in range(len(terminal_list)):
                for j in range(i + 1, len(terminal_list)):
                    source_id = symbol_lookup[terminal_list[i]]
                    target_id = symbol_lookup[terminal_list[j]]

                    edge_key = (source_id, target_id)
                    reverse_key = (target_id, source_id)

                    if edge_key not in added_edges and reverse_key not in added_edges:
                        edges.append((
                            source_id,
                            target_id,
                            {
                                "type": "pipe",
                                "connection_type": "chain"
                            }
                        ))
                        added_edges.add(edge_key)

        return edges

    def _find_proximity_connections(
        self,
        symbols: List[Dict],
        symbol_lookup: Dict[int, str]
    ) -> List[Tuple[str, str, Dict]]:
        """
        Find symbol-to-symbol connections based on proximity.

        Equipment and valves that are very close together are likely connected.
        """
        edges = []
        threshold = self.symbol_proximity_threshold

        for i, sym1 in enumerate(symbols):
            for j, sym2 in enumerate(symbols):
                if i >= j:
                    continue

                c1 = sym1.get("center", (0, 0))
                c2 = sym2.get("center", (0, 0))

                dist = np.sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2)

                if dist < threshold:
                    # Check alignment (horizontal or vertical)
                    dx = abs(c1[0] - c2[0])
                    dy = abs(c1[1] - c2[1])

                    # Must be roughly aligned
                    if dx < threshold / 2 or dy < threshold / 2:
                        source_id = symbol_lookup[i]
                        target_id = symbol_lookup[j]

                        edges.append((
                            source_id,
                            target_id,
                            {
                                "type": "proximity",
                                "distance": dist
                            }
                        ))

        return edges

    def graph_to_dict(self, G: nx.DiGraph) -> Dict:
        """Convert NetworkX graph to JSON-serializable dict."""
        return {
            "nodes": [
                {
                    "id": node,
                    **{k: (list(v) if isinstance(v, tuple) else v)
                       for k, v in data.items() if v is not None}
                }
                for node, data in G.nodes(data=True)
            ],
            "edges": [
                {
                    "source": u,
                    "target": v,
                    **data
                }
                for u, v, data in G.edges(data=True)
            ],
            "stats": {
                "node_count": G.number_of_nodes(),
                "edge_count": G.number_of_edges(),
                "components": self._count_by_type(G),
            }
        }

    def _count_by_type(self, G: nx.DiGraph) -> Dict[str, int]:
        """Count nodes by component type."""
        counts = {}
        for _, data in G.nodes(data=True):
            comp_type = data.get("type", "unknown")
            counts[comp_type] = counts.get(comp_type, 0) + 1
        return counts

    def get_connected_components(
        self,
        G: nx.DiGraph,
        node_id: str
    ) -> Dict:
        """Get all components connected to a given node."""
        if node_id not in G:
            return {"error": "Node not found"}

        # Get upstream (predecessors) and downstream (successors)
        predecessors = list(G.predecessors(node_id))
        successors = list(G.successors(node_id))

        return {
            "node": node_id,
            "node_data": dict(G.nodes[node_id]),
            "upstream": [{"id": p, **G.nodes[p]} for p in predecessors],
            "downstream": [{"id": s, **G.nodes[s]} for s in successors],
        }


# Singleton instance
graph_construction_service = GraphConstructionService()
