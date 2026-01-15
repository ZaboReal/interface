# Task 1: Collaborative Document Review

A real-time collaborative document editor that enables multiple users within an organization to edit documents simultaneously, with live presence indicators and revision history tracking.

## Thought Process & Approach

### The Problem
Organizations need a way for multiple team members to collaborate on document reviews in real-time. Traditional approaches involve passing documents back and forth via email, leading to version conflicts and slow iteration cycles.

### Our Solution
We built a WebSocket-based real-time collaboration system that:

1. **Organization-Scoped Access**: Users authenticate with an `orgId` and `userId`. All users in the same organization see and edit the same document state.

2. **Real-Time Synchronization**: Changes propagate instantly to all connected users via WebSocket connections. When you type, everyone sees it immediately.

3. **Presence Awareness**: Users can see who else is currently viewing/editing the document through color-coded presence indicators with avatars.

4. **Revision History**: Every edit is tracked with timestamps, allowing users to see the full history of changes and who made them.

### Technical Decisions

- **WebSocket over Polling**: We chose WebSockets for true real-time sync rather than HTTP polling, which would introduce latency and unnecessary server load.

- **In-Memory State with Optional Persistence**: The primary state lives in memory for speed, with optional Supabase persistence for durability across server restarts.

- **Simple Text Editor**: We opted for a textarea-based editor rather than a rich text editor to keep the implementation focused and avoid complexity. This can be upgraded to a full WYSIWYG editor in future iterations.

- **Organization-Based Isolation**: Documents are scoped to organizations, providing natural multi-tenancy without complex permission systems.

## Architecture

```
Frontend (Next.js)                    Backend (FastAPI)
┌─────────────────┐                  ┌─────────────────┐
│  CollaborativeEditor  │◄──WebSocket──►│  WebSocket Hub    │
│  PresenceIndicator    │              │  State Manager    │
│  RevisionStatus       │              │  Revision Tracker │
│  ReviewHistory        │              │  (Supabase opt.)  │
└─────────────────┘                  └─────────────────┘
```

### Key Components

**Frontend (`/frontend/src/app/review/`):**
- `CollaborativeEditor.tsx` - Main editor textarea with real-time sync
- `PresenceIndicator.tsx` - Shows active users with avatars
- `RevisionStatus.tsx` - Displays document status and character count
- `ReviewHistory.tsx` - Shows chronological edit history
- `OnboardingModal.tsx` - Login screen for org/user credentials

**Backend (`/backend/`):**
- WebSocket connection management
- Real-time state synchronization
- Revision tracking with full history

## How to Use

### 1. Access the Review Page

Click on **"SOP Review"** in the sidebar to access the collaborative editor.

### 2. Join a Session

When the page loads, you'll see an onboarding modal:

1. Enter your **Organization ID** (e.g., `acme-corp`)
2. Enter your **User ID** (e.g., `john-doe`)
3. Click **"Join Session"**

### 3. Collaborate

Once connected:

- **Edit**: Type in the main text area - changes sync in real-time
- **See Presence**: Look at the top-right to see who else is connected
- **View History**: Check the right sidebar for edit history
- **Track Status**: The status card shows document state and character count

### 4. Multi-User Collaboration

To collaborate with others:

1. Share the website URL with team members
2. Have everyone use the same `orgId` but different `userId` values
3. Type in one browser and watch changes appear in others instantly

## Features

| Feature | Description |
|---------|-------------|
| Real-time Sync | Changes appear instantly for all users |
| Presence Indicators | See who's currently viewing/editing |
| Edit History | Full revision history with timestamps |
| Organization Scope | Documents isolated per organization |
| Character Count | Live character count tracking |
| Reconnection | Automatic reconnection on connection loss |

