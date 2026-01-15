# Graph Builder Service - Builds NetworkX graph from detected P&ID components
import networkx as nx
from typing import List, Dict, Tuple, Optional
import numpy as np
import json


class GraphBuilder:
    """Builds NetworkX graph from detected components and connections."""

    def __init__(self, max_connection_distance: int = 100):
        self.max_connection_distance = max_connection_distance  # pixels

    def build_graph(
        self,
        components: List[Dict],
        lines: List[Dict]
    ) -> nx.DiGraph:
        """Build a directed graph from components and connections."""
        G = nx.DiGraph()

        # Add nodes (components)
        for i, comp in enumerate(components):
            node_id = comp.get("tag") or f"{comp['type']}_{i}"
            G.add_node(
                node_id,
                type=comp["type"],
                label=comp.get("label", ""),
                position=comp["center"],
                bbox=comp["bbox"],
                confidence=comp.get("confidence", 0),
                detection_method=comp.get("detection_method", "unknown"),
            )

        # Find connections between components
        edges = self._find_connections(components, lines)

        # Add edges
        for source, target, attrs in edges:
            G.add_edge(source, target, **attrs)

        return G

    def _find_connections(
        self,
        components: List[Dict],
        lines: List[Dict]
    ) -> List[Tuple[str, str, Dict]]:
        """Find connections between components based on line proximity."""
        edges = []

        # Create component index
        comp_index = {}
        for i, comp in enumerate(components):
            node_id = comp.get("tag") or f"{comp['type']}_{i}"
            comp_index[i] = {
                "id": node_id,
                "center": comp["center"],
                "bbox": comp["bbox"],
            }

        # Analyze each line
        for line in lines:
            start = line["start"]
            end = line["end"]

            # Find components near line endpoints
            start_comp = self._find_nearest_component(start, comp_index)
            end_comp = self._find_nearest_component(end, comp_index)

            if (start_comp is not None and
                end_comp is not None and
                start_comp != end_comp):

                source_id = comp_index[start_comp]["id"]
                target_id = comp_index[end_comp]["id"]

                edges.append((
                    source_id,
                    target_id,
                    {
                        "type": "pipe",
                        "line_type": line["type"],
                        "length": line["length"],
                    }
                ))

        # Remove duplicate edges
        seen = set()
        unique_edges = []
        for edge in edges:
            key = (edge[0], edge[1])
            if key not in seen:
                seen.add(key)
                unique_edges.append(edge)

        return unique_edges

    def _find_nearest_component(
        self,
        point: Tuple[int, int],
        comp_index: Dict
    ) -> Optional[int]:
        """Find the nearest component to a point."""
        min_dist = float("inf")
        nearest = None

        for i, comp in comp_index.items():
            x, y, w, h = comp["bbox"]
            cx, cy = comp["center"]

            # Distance to center
            dist = np.sqrt((point[0] - cx) ** 2 + (point[1] - cy) ** 2)

            # Check if inside bbox (distance = 0)
            if x <= point[0] <= x + w and y <= point[1] <= y + h:
                return i

            if dist < min_dist and dist < self.max_connection_distance:
                min_dist = dist
                nearest = i

        return nearest

    def graph_to_dict(self, G: nx.DiGraph) -> Dict:
        """Convert NetworkX graph to JSON-serializable dict."""
        return {
            "nodes": [
                {
                    "id": node,
                    **{k: v if not isinstance(v, tuple) else list(v)
                       for k, v in data.items()}
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

    def export_graphml(self, G: nx.DiGraph, filepath: str) -> None:
        """Export graph to GraphML format."""
        G_export = G.copy()
        for node in G_export.nodes():
            for key, value in G_export.nodes[node].items():
                if isinstance(value, (tuple, list)):
                    G_export.nodes[node][key] = str(value)

        nx.write_graphml(G_export, filepath)

    def get_component_neighbors(
        self,
        G: nx.DiGraph,
        component_id: str
    ) -> Dict:
        """Get all components connected to a given component."""
        if component_id not in G:
            return {"error": "Component not found"}

        predecessors = list(G.predecessors(component_id))
        successors = list(G.successors(component_id))

        return {
            "component": component_id,
            "upstream": [
                {"id": p, **G.nodes[p]} for p in predecessors
            ],
            "downstream": [
                {"id": s, **G.nodes[s]} for s in successors
            ],
        }


# Singleton instance
graph_builder = GraphBuilder()
