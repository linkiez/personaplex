# Wake Word Implementation Guide

## Goal

Provide a low-latency wake-word gate so the system can stay in standby and only open full conversation mode when user activity is detected.

## Current Status

- ONNX runtime integration in Angular is implemented
- RMS fallback path is implemented
- Wake-word state machine is implemented
- Angular tests for wake-word services are implemented
- Benchmark script is available under client-angular/scripts/benchmark-wake-word-onnx.mjs

## Detection Pipeline

1. Capture microphone audio using Web Audio APIs
2. Compute rolling RMS and frame slices
3. Run ONNX inference when available
4. Fall back to RMS-only decision logic on model/runtime failures
5. Trigger wake state transition
6. Keep conversation active until silence timeout

## Main Files

- client-angular/src/app/wake-word/wake-word-detector.service.ts
- client-angular/src/app/wake-word/wake-word-state.service.ts
- client-angular/src/app/wake-word/wake-word-indicator.component.ts

## ONNX Model Asset

Model path in Angular public assets:

- client-angular/public/models/silero-vad.onnx

## Benchmark

```bash
cd client-angular
npm run benchmark:wake-word
```

You can pass custom values:

```bash
node scripts/benchmark-wake-word-onnx.mjs 250 25
```

## Tuning Guidelines

- Increase sensitivity for quiet rooms
- Lower sensitivity for noisy environments
- Tune silence timeout to balance responsiveness vs cost

## Validation Checklist

- Wake transition works from standby
- No repeated reconnect loops on activation
- Silence timeout returns to standby reliably
- Browser CPU usage remains stable in standby mode
