import type { Spec } from '@json-render/core';

/**
 * Uses Chart/Table/Card/Quote/CodeBlock/KeyValueList/Details: a benchmarking research summary, the
 * kind of artifact a Claude research task produces.
 */
const spec: Spec = {
  root: 'root',
  elements: {
    root: {
      type: 'Section',
      props: {
        title: 'Local LLM Inference on Apple Silicon',
        subtitle: 'Benchmark summary — M3 Max, 128GB, July 2026',
      },
      children: [
        'intro',
        'stat-grid',
        'chart-heading',
        'chart',
        'table-heading',
        'table',
        'rig',
        'caveat',
        'quote',
        'launch-heading',
        'launch-code',
        'methodology',
      ],
    },
    intro: {
      type: 'Prose',
      props: {
        markdown:
          "Ran five open-weight models at four quantization levels each to see where the tokens/sec-vs-quality knee actually sits on a single high-memory Apple Silicon box. Short version: **Q5_K_M is the sweet spot** for anything above 13B parameters — Q4 saves memory but costs more quality than the extra tokens/sec are worth once you're already running comfortably in RAM.",
      },
      children: [],
    },
    'stat-grid': {
      type: 'Grid',
      props: { columns: 3 },
      children: ['stat-throughput', 'stat-memory', 'stat-models'],
    },
    'stat-throughput': {
      type: 'Card',
      props: {
        title: 'Best throughput (70B, Q4_K_M)',
        value: '18.4 tok/s',
        delta: '+61% vs Q8_0',
        trend: 'up',
      },
      children: [],
    },
    'stat-memory': {
      type: 'Card',
      props: {
        title: 'Peak memory (70B, Q8_0)',
        value: '74.2 GB',
        delta: 'fits with headroom',
        trend: 'flat',
      },
      children: [],
    },
    'stat-models': {
      type: 'Card',
      props: { title: 'Model/quant pairs tested', value: '20', delta: '5 models × 4 quants' },
      children: [],
    },
    'chart-heading': {
      type: 'Heading',
      props: { level: 2, text: 'Throughput vs Quantization' },
      children: [],
    },
    chart: {
      type: 'Chart',
      props: {
        kind: 'bar',
        valueLabel: 'Tokens/sec',
        data: [
          { label: 'Q8_0', value: 11.4 },
          { label: 'Q6_K', value: 13.9 },
          { label: 'Q5_K_M', value: 15.8 },
          { label: 'Q4_K_M', value: 18.4 },
        ],
      },
      children: [],
    },
    'table-heading': {
      type: 'Heading',
      props: { level: 2, text: 'Full Results' },
      children: [],
    },
    table: {
      type: 'Table',
      props: {
        columns: [
          { key: 'model', label: 'Model' },
          { key: 'quant', label: 'Quant' },
          { key: 'tokps', label: 'Tok/s', align: 'right' },
          { key: 'mem', label: 'Memory', align: 'right' },
          { key: 'mmlu', label: 'MMLU delta', align: 'right' },
        ],
        rows: [
          { model: 'Llama 3.3 70B', quant: 'Q4_K_M', tokps: '18.4', mem: '42.1 GB', mmlu: '-2.1' },
          { model: 'Llama 3.3 70B', quant: 'Q5_K_M', tokps: '15.8', mem: '49.8 GB', mmlu: '-0.9' },
          { model: 'Llama 3.3 70B', quant: 'Q6_K', tokps: '13.9', mem: '57.4 GB', mmlu: '-0.3' },
          { model: 'Llama 3.3 70B', quant: 'Q8_0', tokps: '11.4', mem: '74.2 GB', mmlu: '0 (ref)' },
          { model: 'Qwen 2.5 32B', quant: 'Q4_K_M', tokps: '27.6', mem: '19.5 GB', mmlu: '-1.8' },
          { model: 'Qwen 2.5 32B', quant: 'Q5_K_M', tokps: '23.9', mem: '23.1 GB', mmlu: '-0.7' },
          {
            model: 'Mixtral 8x7B',
            quant: 'Q4_K_M',
            tokps: '31.2',
            mem: '26.8 GB',
            mmlu: '-2.4',
          },
          {
            model: 'Mixtral 8x7B',
            quant: 'Q5_K_M',
            tokps: '26.5',
            mem: '31.9 GB',
            mmlu: '-1.1',
          },
        ],
      },
      children: [],
    },
    rig: {
      type: 'KeyValueList',
      props: {
        columns: 2,
        items: [
          { id: 'chip', key: 'Chip', value: 'Apple M3 Max, 16-core CPU / 40-core GPU' },
          { id: 'ram', key: 'Unified memory', value: '128 GB' },
          { id: 'runtime', key: 'Runtime', value: 'llama.cpp b3720, Metal backend' },
          { id: 'context', key: 'Context window', value: '4,096 tokens (fixed for all runs)' },
        ],
      },
      children: [],
    },
    caveat: {
      type: 'Callout',
      props: {
        variant: 'warning',
        title: 'Sustained load throttles',
        markdown:
          'Throughput above is the first-30-seconds number. On the 70B runs, sustained generation past ~5 minutes drops 8-12% as the chassis heat-soaks — worth a fan curve check before trusting these numbers for a long batch job.',
      },
      children: [],
    },
    quote: {
      type: 'Quote',
      props: {
        markdown:
          "Q5_K_M is close enough to Q6_K on quality that the extra 8GB almost never buys you anything, unless you're already memory-constrained elsewhere.",
        attribution: 'llama.cpp quantization guide, ggml-org',
      },
      children: [],
    },
    'launch-heading': {
      type: 'Heading',
      props: { level: 2, text: 'Launch Command' },
      children: [],
    },
    'launch-code': {
      type: 'CodeBlock',
      props: {
        filename: 'run-70b.sh',
        language: 'bash',
        code: 'llama-server \\\n  --model llama-3.3-70b-instruct.Q5_K_M.gguf \\\n  --ctx-size 4096 \\\n  --n-gpu-layers 999 \\\n  --flash-attn \\\n  --port 8080',
      },
      children: [],
    },
    methodology: {
      type: 'Details',
      props: {
        summary: 'Methodology notes',
        markdown:
          'Each cell is the mean of three runs, 512-token generations, greedy decoding, cold cache between models but warm cache between quant levels of the same model. MMLU delta is against a 5-shot subset (300 questions), not the full benchmark — treat as directional, not authoritative.',
      },
      children: [],
    },
  },
};

export const researchSummaryExample = {
  title: 'Local LLM Inference on Apple Silicon',
  description: 'Benchmark summary comparing quantization levels for local inference on an M3 Max.',
  tags: ['research', 'llm', 'demo'],
  spec,
};
