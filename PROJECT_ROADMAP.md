# Project Roadmap

## Product Direction

VoxPulse focuses on reliable, low-latency voice interaction with optional robotics action execution.

## Phase Summary

### Phase 1 (Completed)

- Real-time full-duplex voice conversation
- Angular UI with streaming audio controls
- Python runtime integration with LocalAI-compatible backend

### Phase 2 (Completed)

- OpenClaw monitor full-duplex bridge
- Action extraction and safety validation
- Sensor feedback integration

### Phase 3 (In Progress)

- API-first multi-user features
- OIDC auth hardening
- Conversation persistence and preferences
- Operational observability polish

### Phase 4 (Planned)

- Expanded model routing
- Better mobile and edge deployments
- Additional workflow automation for robotics use cases

## Engineering Priorities

1. Reliability and deterministic behavior under degraded network conditions
2. Security hardening for auth and secret handling
3. Lower latency in browser inference and server streaming loops
4. Test coverage expansion for cross-service flows

## Success Metrics

- End-to-end first-response latency target under 500ms
- Stable reconnect behavior for monitor and websocket clients
- Zero secret leaks in repository history
- Green CI for Python, Angular, and Node test suites
