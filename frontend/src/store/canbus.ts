import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { CanFrame, DbcMessage, BusStats, ValidationResult, ValidationSummary } from '../types';
import { parseDbc, decodeCanFrame, DEFAULT_DBC_CONTENT, PROBLEMATIC_DBC_CONTENT, UNDEFINED_FRAME_IDS } from '../utils/dbc-parser';
import { validateDefinitions, getValidationSummary } from '../utils/validation';

let frameIdCounter = 0;

export const useCanBusStore = defineStore('canbus', () => {
  const frames = ref<CanFrame[]>([]);
  const signals = ref<Map<string, { name: string; data: { time: number; value: number }[] }>>(new Map());
  const dbcMessages = ref<Map<number, DbcMessage>>(new Map());
  const filterId = ref('');
  const filterText = ref('');
  const isCapturing = ref(false);
  const pollInterval = ref<number | null>(null);

  const validationResult = ref<ValidationResult>({
    issues: [],
    totalIssues: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    lastValidated: 0
  });

  const autoValidate = ref(true);
  let lastValidationTime = 0;
  const VALIDATION_THROTTLE_MS = 1000;

  const busStats = ref<BusStats>({
    totalFrames: 0,
    rxCount: 0,
    txCount: 0,
    errorCount: 0,
    busLoad: 0,
    lastUpdate: Date.now()
  });

  const filteredFrames = computed(() => {
    let result = frames.value;

    if (filterId.value.trim()) {
      const idFilter = filterId.value.trim().toLowerCase().replace(/^0x/, '');
      result = result.filter(f =>
        f.arbitrationId.toString(16).toLowerCase().includes(idFilter)
      );
    }

    if (filterText.value.trim()) {
      const textFilter = filterText.value.trim().toLowerCase();
      result = result.filter(f => {
        if (f.arbitrationId.toString(16).toLowerCase().includes(textFilter)) return true;
        if (f.data.toLowerCase().includes(textFilter)) return true;
        for (const key of Object.keys(f.decoded)) {
          if (key.toLowerCase().includes(textFilter)) return true;
        }
        return false;
      });
    }

    return result;
  });

  const busLoadPercent = computed(() => {
    return busStats.value.busLoad.toFixed(1);
  });

  const validationSummary = computed((): ValidationSummary => {
    return getValidationSummary(validationResult.value);
  });

  const hasValidationErrors = computed(() => validationResult.value.errorCount > 0);
  const hasValidationWarnings = computed(() => validationResult.value.warningCount > 0);

  function addFrame(frame: CanFrame) {
    frames.value.push(frame);
    if (frames.value.length > 500) {
      frames.value = frames.value.slice(-500);
    }

    busStats.value.totalFrames++;
    if (frame.direction === 'RX') busStats.value.rxCount++;
    else busStats.value.txCount++;
    busStats.value.lastUpdate = Date.now();

    // Update signal history
    const msgDef = dbcMessages.value.get(frame.arbitrationId);
    if (msgDef) {
      const decoded = decodeCanFrame(frame, msgDef);
      frame.decoded = decoded;
      for (const [name, value] of Object.entries(decoded)) {
        if (!signals.value.has(name)) {
          signals.value.set(name, { name, data: [] });
        }
        const sig = signals.value.get(name)!;
        sig.data.push({ time: frame.timestamp, value });
        if (sig.data.length > 100) {
          sig.data = sig.data.slice(-100);
        }
      }
    }

    // Simulate bus load (random 15-45%)
    busStats.value.busLoad = 15 + Math.random() * 30;

    if (autoValidate.value) {
      const now = Date.now();
      if (now - lastValidationTime > VALIDATION_THROTTLE_MS) {
        lastValidationTime = now;
        runValidation();
      }
    }
  }

  function clearFrames() {
    frames.value = [];
    signals.value = new Map();
    busStats.value = {
      totalFrames: 0,
      rxCount: 0,
      txCount: 0,
      errorCount: 0,
      busLoad: 0,
      lastUpdate: Date.now()
    };
    frameIdCounter = 0;
    if (autoValidate.value) {
      runValidation();
    }
  }

  function loadMockDbc() {
    parseAndLoadDbc(DEFAULT_DBC_CONTENT);
  }

  function loadProblematicDbc() {
    parseAndLoadDbc(PROBLEMATIC_DBC_CONTENT);
  }

  function parseAndLoadDbc(text: string) {
    dbcMessages.value = parseDbc(text);
    if (autoValidate.value) {
      runValidation();
    }
  }

  function runValidation() {
    validationResult.value = validateDefinitions(frames.value, dbcMessages.value);
  }

  function toggleAutoValidate(enabled: boolean) {
    autoValidate.value = enabled;
    if (enabled) {
      runValidation();
    }
  }

  function generateMockFrame(): CanFrame {
    const definedMessageIds = Array.from(dbcMessages.value.keys());

    const rand = Math.random();
    let arbId: number;
    let msgDef: DbcMessage | undefined;
    let dlcOverride: number;
    let dataBytes: number[];
    let corruptedData = false;

    if (rand < 0.25 && UNDEFINED_FRAME_IDS.length > 0) {
      arbId = UNDEFINED_FRAME_IDS[Math.floor(Math.random() * UNDEFINED_FRAME_IDS.length)];
      msgDef = undefined;
      dlcOverride = 8;
      dataBytes = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
    } else if (rand < 0.35 && definedMessageIds.length > 0) {
      arbId = definedMessageIds[Math.floor(Math.random() * definedMessageIds.length)];
      msgDef = dbcMessages.value.get(arbId);
      dlcOverride = Math.max(1, (msgDef?.dlc ?? 8) - 1);
      dataBytes = Array.from({ length: dlcOverride }, () => Math.floor(Math.random() * 256));
      corruptedData = true;
    } else if (definedMessageIds.length > 0) {
      arbId = definedMessageIds[Math.floor(Math.random() * definedMessageIds.length)];
      msgDef = dbcMessages.value.get(arbId);
      dlcOverride = msgDef?.dlc ?? 8;
      dataBytes = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
    } else {
      arbId = 0x7DF;
      msgDef = undefined;
      dlcOverride = 8;
      dataBytes = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
    }

    const dataHex = dataBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

    const frame: CanFrame = {
      id: `frame-${++frameIdCounter}`,
      timestamp: Date.now(),
      arbitrationId: arbId,
      dlc: dlcOverride,
      data: dataHex,
      decoded: {},
      direction: Math.random() > 0.3 ? 'RX' : 'TX'
    };

    if (msgDef && !corruptedData) {
      try {
        frame.decoded = decodeCanFrame(frame, msgDef);
      } catch {
        frame.decoded = {};
      }
    }

    return frame;
  }

  function startCapture() {
    if (isCapturing.value) return;
    isCapturing.value = true;

    // Load mock DBC if not loaded
    if (dbcMessages.value.size === 0) {
      loadMockDbc();
    }

    pollInterval.value = window.setInterval(() => {
      const frame = generateMockFrame();
      addFrame(frame);
    }, 200);
  }

  function stopCapture() {
    isCapturing.value = false;
    if (pollInterval.value !== null) {
      clearInterval(pollInterval.value);
      pollInterval.value = null;
    }
  }

  function decodeFrame(frame: CanFrame): Record<string, number> {
    const msgDef = dbcMessages.value.get(frame.arbitrationId);
    if (!msgDef) return {};
    return decodeCanFrame(frame, msgDef);
  }

  function exportFrames(): string {
    const header = 'Timestamp,Direction,CAN_ID,DLC,Data,Decoded\n';
    const rows = frames.value.map(f => {
      const decodedStr = Object.entries(f.decoded)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      return `${f.timestamp},${f.direction},0x${f.arbitrationId.toString(16).toUpperCase()},${f.dlc},"${f.data}","${decodedStr}"`;
    }).join('\n');
    return header + rows;
  }

  return {
    frames,
    signals,
    dbcMessages,
    filterId,
    filterText,
    busStats,
    isCapturing,
    filteredFrames,
    busLoadPercent,
    validationResult,
    validationSummary,
    autoValidate,
    hasValidationErrors,
    hasValidationWarnings,
    addFrame,
    clearFrames,
    loadMockDbc,
    loadProblematicDbc,
    parseAndLoadDbc,
    startCapture,
    stopCapture,
    decodeFrame,
    exportFrames,
    runValidation,
    toggleAutoValidate
  };
});
