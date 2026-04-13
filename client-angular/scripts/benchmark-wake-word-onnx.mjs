#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import * as ort from 'onnxruntime-web';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_ITERATIONS = 250;
const DEFAULT_WARMUP = 25;
const FRAME_SIZE = 512;
const H_STATE_SIZE = 2 * 1 * 64;
const STATE_SIZE = 2 * 1 * 128;

function parsePositiveInteger(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function buildFrame(index, frameSize) {
  const frame = new Float32Array(frameSize);
  const frequency = 180 + (index % 11) * 20;
  const amplitude = 0.15 + ((index % 7) / 100);

  for (let i = 0; i < frameSize; i += 1) {
    const t = i / 16000;
    const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude;
    const noise = (Math.random() - 0.5) * 0.02;
    frame[i] = sample + noise;
  }

  return frame;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) {
    return 0;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const rank = (p / 100) * (sortedValues.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) {
    return sortedValues[low];
  }
  const weight = rank - low;
  return sortedValues[low] * (1 - weight) + sortedValues[high] * weight;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

async function resolveModelPath(argModelPath) {
  if (argModelPath) {
    return path.resolve(process.cwd(), argModelPath);
  }

  const localAngularPublic = path.resolve(__dirname, '../public/models/silero-vad.onnx');
  try {
    await fs.access(localAngularPublic);
    return localAngularPublic;
  } catch {
    // Continue trying fallback path.
  }

  return path.resolve(__dirname, '../../client/public/models/silero-vad.onnx');
}

async function main() {
  const [iterationsArg, warmupArg, modelPathArg] = process.argv.slice(2);
  const iterations = parsePositiveInteger(iterationsArg, DEFAULT_ITERATIONS);
  const warmup = parsePositiveInteger(warmupArg, DEFAULT_WARMUP);
  const modelPath = await resolveModelPath(modelPathArg);

  const modelBuffer = await fs.readFile(modelPath);
  const session = await ort.InferenceSession.create(modelBuffer, {
    executionProviders: ['wasm'],
  });

  const h = new Float32Array(H_STATE_SIZE);
  const c = new Float32Array(H_STATE_SIZE);
  const state = new Float32Array(STATE_SIZE);
  const sr = new BigInt64Array([16000n]);

  const inputName = session.inputNames.find((name) => name.includes('input')) ?? session.inputNames[0];
  const stateName = session.inputNames.find((name) => name === 'state') ?? 'state';
  const hName = session.inputNames.find((name) => name === 'h') ?? 'h';
  const cName = session.inputNames.find((name) => name === 'c') ?? 'c';
  const srName = session.inputNames.find((name) => name === 'sr') ?? 'sr';

  const outputName = session.outputNames.find((name) => name.includes('output')) ?? session.outputNames[0];
  const stateNName = session.outputNames.find((name) => name === 'stateN') ?? 'stateN';
  const hnName = session.outputNames.find((name) => name === 'hn') ?? 'hn';
  const cnName = session.outputNames.find((name) => name === 'cn') ?? 'cn';
  const hasStateInput = session.inputNames.includes(stateName);
  const hasLegacyState = session.inputNames.includes(hName) && session.inputNames.includes(cName);

  const runOnce = async (frameIndex) => {
    const frame = buildFrame(frameIndex, FRAME_SIZE);
    const feeds = {
      [inputName]: new ort.Tensor('float32', frame, [1, frame.length]),
      [srName]: new ort.Tensor('int64', sr, []),
    };

    if (hasStateInput) {
      feeds[stateName] = new ort.Tensor('float32', state, [2, 1, 128]);
    } else if (hasLegacyState) {
      feeds[hName] = new ort.Tensor('float32', h, [2, 1, 64]);
      feeds[cName] = new ort.Tensor('float32', c, [2, 1, 64]);
    }

    const startedAt = performance.now();
    const outputs = await session.run(feeds);
    const elapsed = performance.now() - startedAt;

    const stateN = outputs[stateNName]?.data;
    const hn = outputs[hnName]?.data;
    const cn = outputs[cnName]?.data;
    if (stateN instanceof Float32Array) {
      state.set(stateN);
    }
    if (hn instanceof Float32Array) {
      h.set(hn);
    }
    if (cn instanceof Float32Array) {
      c.set(cn);
    }

    const confidenceValues = outputs[outputName]?.data;
    const confidence = confidenceValues instanceof Float32Array && confidenceValues.length > 0
      ? confidenceValues[0]
      : 0;

    return { elapsed, confidence };
  };

  for (let i = 0; i < warmup; i += 1) {
    await runOnce(i);
  }

  const times = [];
  const confidences = [];

  for (let i = 0; i < iterations; i += 1) {
    const { elapsed, confidence } = await runOnce(warmup + i);
    times.push(elapsed);
    confidences.push(confidence);
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((acc, value) => acc + value, 0);
  const avg = sum / times.length;
  const max = sorted.at(-1) ?? 0;
  const min = sorted.at(0) ?? 0;
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const confidenceAvg = confidences.reduce((acc, value) => acc + value, 0) / confidences.length;

  console.log('Wake-word ONNX benchmark');
  console.log(`model=${modelPath}`);
  console.log(`iterations=${iterations} warmup=${warmup} frameSize=${FRAME_SIZE}`);
  console.log(`latency_ms avg=${round2(avg)} p50=${round2(p50)} p95=${round2(p95)} min=${round2(min)} max=${round2(max)}`);
  console.log(`confidence avg=${round2(confidenceAvg)}`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`Benchmark failed: ${message}`);
  process.exitCode = 1;
}
