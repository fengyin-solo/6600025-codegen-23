import type {
  CanFrame,
  DbcMessage,
  DbcSignal,
  ValidationIssue,
  ValidationResult,
  ValidationSummary
} from '../types';
import { decodeCanFrame } from './dbc-parser';

let issueIdCounter = 0;

function generateIssueId(): string {
  return `issue-${++issueIdCounter}`;
}

export function checkMissingDefinitions(
  frames: CanFrame[],
  messages: Map<number, DbcMessage>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const missingIds = new Set<number>();
  const missingFrameCount = new Map<number, number>();
  const sampleFrames = new Map<number, CanFrame>();

  for (const frame of frames) {
    if (!messages.has(frame.arbitrationId)) {
      missingIds.add(frame.arbitrationId);
      missingFrameCount.set(
        frame.arbitrationId,
        (missingFrameCount.get(frame.arbitrationId) || 0) + 1
      );
      if (!sampleFrames.has(frame.arbitrationId)) {
        sampleFrames.set(frame.arbitrationId, frame);
      }
    }
  }

  for (const msgId of missingIds) {
    const count = missingFrameCount.get(msgId) || 0;
    const sample = sampleFrames.get(msgId);
    issues.push({
      id: generateIssueId(),
      severity: 'warning',
      category: 'missing_definition',
      title: `缺失消息定义: 0x${msgId.toString(16).toUpperCase()}`,
      description: `检测到 ${count} 帧 ID 为 0x${msgId.toString(16).toUpperCase()} 的数据帧没有对应的 DBC 消息定义，无法进行信号解码。`,
      suggestion: `请在 DBC 文件中添加 BO_ ${msgId} 消息定义，或确认该 ID 是否为预期外的消息。示例帧数据: ${sample?.data || 'N/A'}`,
      messageId: msgId,
      frameId: sample?.id,
      timestamp: sample?.timestamp
    });
  }

  return issues;
}

export function checkDuplicateSignals(
  messages: Map<number, DbcMessage>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const signalOccurrences = new Map<string, { messageId: number; signal: DbcSignal }[]>();

  for (const message of messages.values()) {
    for (const signal of message.signals) {
      const key = signal.name.toLowerCase();
      if (!signalOccurrences.has(key)) {
        signalOccurrences.set(key, []);
      }
      signalOccurrences.get(key)!.push({ messageId: message.id, signal });
    }
  }

  for (const [signalName, occurrences] of signalOccurrences) {
    if (occurrences.length > 1) {
      const msgIds = occurrences.map(o => `0x${o.messageId.toString(16).toUpperCase()}`).join(', ');
      issues.push({
        id: generateIssueId(),
        severity: 'warning',
        category: 'duplicate_signal',
        title: `重复信号名称: ${occurrences[0].signal.name}`,
        description: `信号 "${occurrences[0].signal.name}" 在 ${occurrences.length} 条消息中重复出现: ${msgIds}。这可能导致信号数据混淆或覆盖。`,
        suggestion: '建议为不同消息中的同名信号添加前缀或重命名，例如 MsgName_SignalName，以确保信号名称的唯一性。',
        signalName: occurrences[0].signal.name,
        messageId: occurrences[0].messageId
      });
    }
  }

  const localDups = checkLocalDuplicates(messages);
  issues.push(...localDups);

  return issues;
}

function checkLocalDuplicates(
  messages: Map<number, DbcMessage>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const message of messages.values()) {
    const signalNames = new Map<string, number>();
    for (const signal of message.signals) {
      const key = signal.name.toLowerCase();
      signalNames.set(key, (signalNames.get(key) || 0) + 1);
    }

    for (const [name, count] of signalNames) {
      if (count > 1) {
        issues.push({
          id: generateIssueId(),
          severity: 'error',
          category: 'duplicate_signal',
          title: `消息内重复信号: ${name}`,
          description: `消息 0x${message.id.toString(16).toUpperCase()} (${message.name}) 中存在 ${count} 个名为 "${name}" 的信号。`,
          suggestion: '同一消息内的信号名称必须唯一，请重命名重复的信号。',
          messageId: message.id,
          signalName: name
        });
      }
    }
  }

  return issues;
}

export function checkSignalOverlap(
  messages: Map<number, DbcMessage>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const message of messages.values()) {
    const bitUsage: { signal: DbcSignal; start: number; end: number }[] = [];

    for (const signal of message.signals) {
      bitUsage.push({
        signal,
        start: signal.startBit,
        end: signal.startBit + signal.bitLength - 1
      });
    }

    bitUsage.sort((a, b) => a.start - b.start);

    for (let i = 0; i < bitUsage.length; i++) {
      for (let j = i + 1; j < bitUsage.length; j++) {
        if (bitUsage[j].start <= bitUsage[i].end) {
          const overlapStart = bitUsage[j].start;
          const overlapEnd = Math.min(bitUsage[i].end, bitUsage[j].end);
          const overlapBits = overlapEnd - overlapStart + 1;

          issues.push({
            id: generateIssueId(),
            severity: 'error',
            category: 'signal_overlap',
            title: `信号位重叠: ${bitUsage[i].signal.name} 与 ${bitUsage[j].signal.name}`,
            description: `消息 0x${message.id.toString(16).toUpperCase()} (${message.name}) 中，信号 "${bitUsage[i].signal.name}" (位 ${bitUsage[i].start}-${bitUsage[i].end}) 与信号 "${bitUsage[j].signal.name}" (位 ${bitUsage[j].start}-${bitUsage[j].end}) 存在 ${overlapBits} 位的重叠。`,
            suggestion: '请调整信号的起始位或位长，确保同一消息内的信号在数据字节中不重叠。',
            messageId: message.id,
            signalName: bitUsage[i].signal.name
          });
          break;
        }
      }
    }
  }

  return issues;
}

export function checkInvalidDlc(
  frames: CanFrame[],
  messages: Map<number, DbcMessage>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const dlcMismatches = new Map<number, { expected: number; actual: Set<number>; sampleFrame?: CanFrame }>();

  for (const frame of frames) {
    const msgDef = messages.get(frame.arbitrationId);
    if (msgDef && frame.dlc !== msgDef.dlc) {
      if (!dlcMismatches.has(frame.arbitrationId)) {
        dlcMismatches.set(frame.arbitrationId, {
          expected: msgDef.dlc,
          actual: new Set(),
          sampleFrame: frame
        });
      }
      dlcMismatches.get(frame.arbitrationId)!.actual.add(frame.dlc);
    }
  }

  for (const [msgId, info] of dlcMismatches) {
    const actualDlcs = Array.from(info.actual).join(', ');
    issues.push({
      id: generateIssueId(),
      severity: 'warning',
      category: 'invalid_dlc',
      title: `DLC 不匹配: 消息 0x${msgId.toString(16).toUpperCase()}`,
      description: `DBC 定义的 DLC 为 ${info.expected} 字节，但实际收到的帧 DLC 为 ${actualDlcs} 字节。`,
      suggestion: '请检查 DBC 定义的 DLC 是否正确，或确认硬件是否按预期发送数据长度。',
      messageId: msgId,
      frameId: info.sampleFrame?.id,
      timestamp: info.sampleFrame?.timestamp
    });
  }

  return issues;
}

export function checkUndecodableFrames(
  frames: CanFrame[],
  messages: Map<number, DbcMessage>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const undecodable = new Map<number, { count: number; sampleFrame?: CanFrame; reason: string }>();

  for (const frame of frames) {
    const msgDef = messages.get(frame.arbitrationId);
    if (!msgDef) continue;

    try {
      const hexStr = frame.data.replace(/\s/g, '');
      const byteCount = hexStr.length / 2;
      if (byteCount < msgDef.dlc) {
        if (!undecodable.has(frame.arbitrationId)) {
          undecodable.set(frame.arbitrationId, {
            count: 0,
            sampleFrame: frame,
            reason: `数据长度不足 (${byteCount} 字节 < ${msgDef.dlc} 字节)`
          });
        }
        undecodable.get(frame.arbitrationId)!.count++;
        continue;
      }

      const decoded = decodeCanFrame(frame, msgDef);
      if (Object.keys(decoded).length === 0 && msgDef.signals.length > 0) {
        if (!undecodable.has(frame.arbitrationId)) {
          undecodable.set(frame.arbitrationId, {
            count: 0,
            sampleFrame: frame,
            reason: '解码结果为空'
          });
        }
        undecodable.get(frame.arbitrationId)!.count++;
      }
    } catch (e) {
      if (!undecodable.has(frame.arbitrationId)) {
        undecodable.set(frame.arbitrationId, {
          count: 0,
          sampleFrame: frame,
          reason: `解码异常: ${e instanceof Error ? e.message : String(e)}`
        });
      }
      undecodable.get(frame.arbitrationId)!.count++;
    }
  }

  for (const [msgId, info] of undecodable) {
    const msgDef = messages.get(msgId);
    issues.push({
      id: generateIssueId(),
      severity: 'error',
      category: 'undecodable_frame',
      title: `无法解码的帧: 0x${msgId.toString(16).toUpperCase()}`,
      description: `消息 ${msgDef?.name || '未知'} (0x${msgId.toString(16).toUpperCase()}) 有 ${info.count} 帧无法正常解码。原因: ${info.reason}`,
      suggestion: '请检查 DBC 信号定义的起始位和位长是否正确，以及数据帧格式是否符合预期。',
      messageId: msgId,
      frameId: info.sampleFrame?.id,
      timestamp: info.sampleFrame?.timestamp
    });
  }

  return issues;
}

export function checkValueOutOfRange(
  frames: CanFrame[],
  messages: Map<number, DbcMessage>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const outOfRangeSignals = new Map<string, {
    signal: DbcSignal;
    messageId: number;
    count: number;
    minObserved: number;
    maxObserved: number;
  }>();

  for (const frame of frames) {
    const msgDef = messages.get(frame.arbitrationId);
    if (!msgDef) continue;

    try {
      const decoded = decodeCanFrame(frame, msgDef);
      for (const signal of msgDef.signals) {
        const value = decoded[signal.name];
        if (value === undefined || isNaN(value)) continue;

        const outOfMin = signal.minValue !== undefined && value < signal.minValue;
        const outOfMax = signal.maxValue !== undefined && value > signal.maxValue;

        if (outOfMin || outOfMax) {
          const key = `${msgDef.id}_${signal.name}`;
          if (!outOfRangeSignals.has(key)) {
            outOfRangeSignals.set(key, {
              signal,
              messageId: msgDef.id,
              count: 0,
              minObserved: value,
              maxObserved: value
            });
          }
          const entry = outOfRangeSignals.get(key)!;
          entry.count++;
          entry.minObserved = Math.min(entry.minObserved, value);
          entry.maxObserved = Math.max(entry.maxObserved, value);
        }
      }
    } catch {
      // skip
    }
  }

  for (const [, info] of outOfRangeSignals) {
    issues.push({
      id: generateIssueId(),
      severity: 'info',
      category: 'value_out_of_range',
      title: `信号值超出范围: ${info.signal.name}`,
      description: `消息 0x${info.messageId.toString(16).toUpperCase()} 中信号 "${info.signal.name}" 有 ${info.count} 次值超出定义范围 [${info.signal.minValue}, ${info.signal.maxValue}]，实际观测范围 [${info.minObserved.toFixed(2)}, ${info.maxObserved.toFixed(2)}]。`,
      suggestion: '请确认信号的最小/最大值定义是否准确，或检查数据源是否正常。超出范围的值可能表示传感器异常或定义不完整。',
      messageId: info.messageId,
      signalName: info.signal.name
    });
  }

  return issues;
}

export function validateDefinitions(
  frames: CanFrame[],
  messages: Map<number, DbcMessage>
): ValidationResult {
  const allIssues: ValidationIssue[] = [];

  allIssues.push(...checkMissingDefinitions(frames, messages));
  allIssues.push(...checkDuplicateSignals(messages));
  allIssues.push(...checkSignalOverlap(messages));
  allIssues.push(...checkInvalidDlc(frames, messages));
  allIssues.push(...checkUndecodableFrames(frames, messages));
  allIssues.push(...checkValueOutOfRange(frames, messages));

  const errorCount = allIssues.filter(i => i.severity === 'error').length;
  const warningCount = allIssues.filter(i => i.severity === 'warning').length;
  const infoCount = allIssues.filter(i => i.severity === 'info').length;

  return {
    issues: allIssues,
    totalIssues: allIssues.length,
    errorCount,
    warningCount,
    infoCount,
    lastValidated: Date.now()
  };
}

export function getValidationSummary(result: ValidationResult): ValidationSummary {
  const summary: ValidationSummary = {
    missingDefinitions: 0,
    duplicateSignals: 0,
    undecodableFrames: 0,
    signalOverlaps: 0,
    invalidDlcs: 0,
    valueOutOfRanges: 0
  };

  for (const issue of result.issues) {
    switch (issue.category) {
      case 'missing_definition':
        summary.missingDefinitions++;
        break;
      case 'duplicate_signal':
        summary.duplicateSignals++;
        break;
      case 'undecodable_frame':
        summary.undecodableFrames++;
        break;
      case 'signal_overlap':
        summary.signalOverlaps++;
        break;
      case 'invalid_dlc':
        summary.invalidDlcs++;
        break;
      case 'value_out_of_range':
        summary.valueOutOfRanges++;
        break;
    }
  }

  return summary;
}

export function sortIssuesBySeverity(issues: ValidationIssue[]): ValidationIssue[] {
  const severityOrder = { error: 0, warning: 1, info: 2 };
  return [...issues].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

export function filterIssuesBySeverity(
  issues: ValidationIssue[],
  severity: string
): ValidationIssue[] {
  if (severity === 'all') return issues;
  return issues.filter(i => i.severity === severity);
}

export function filterIssuesByCategory(
  issues: ValidationIssue[],
  category: string
): ValidationIssue[] {
  if (category === 'all') return issues;
  return issues.filter(i => i.category === category);
}
