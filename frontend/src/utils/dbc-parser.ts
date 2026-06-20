import type { CanFrame, DbcMessage, DbcSignal } from '../types';

/**
 * Parse DBC text content and extract messages and signals
 */
export function parseDbc(text: string): Map<number, DbcMessage> {
  const messages = new Map<number, DbcMessage>();
  const lines = text.split('\n');
  let currentMessage: DbcMessage | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match BO_ line: BO_ <id> <name>: <dlc> <sender>
    const msgMatch = trimmed.match(/^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(\w+)/);
    if (msgMatch) {
      currentMessage = {
        id: parseInt(msgMatch[1]),
        name: msgMatch[2],
        dlc: parseInt(msgMatch[3]),
        sender: msgMatch[4],
        signals: []
      };
      messages.set(currentMessage.id, currentMessage);
      continue;
    }

    // Match SG_ line: SG_ <name> : <start>|<len>@<byte_order><sign> (<factor>,<offset>) [<min>|<max>] "<unit>" <receivers>
    const sigMatch = trimmed.match(
      /^SG_\s+(\w+)\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"/
    );
    if (sigMatch && currentMessage) {
      const signal: DbcSignal = {
        name: sigMatch[1],
        startBit: parseInt(sigMatch[2]),
        bitLength: parseInt(sigMatch[3]),
        factor: parseFloat(sigMatch[6]),
        offset: parseFloat(sigMatch[7]),
        minValue: parseFloat(sigMatch[8]),
        maxValue: parseFloat(sigMatch[9]),
        unit: sigMatch[10],
        messageId: currentMessage.id
      };
      currentMessage.signals.push(signal);
      continue;
    }

    // Empty line ends current message block
    if (trimmed === '') {
      currentMessage = null;
    }
  }

  return messages;
}

/**
 * Extract a signal value from raw CAN data bytes
 */
function extractSignalValue(dataBytes: number[], signal: DbcSignal): number {
  // Convert data bytes to a bit array (LSB first within each byte)
  const bits: number[] = [];
  for (const byte of dataBytes) {
    for (let bit = 0; bit < 8; bit++) {
      bits.push((byte >> bit) & 1);
    }
  }

  // Extract bits for this signal (Intel byte order / little-endian)
  let rawValue = 0;
  for (let i = 0; i < signal.bitLength; i++) {
    const bitIndex = signal.startBit + i;
    if (bitIndex < bits.length) {
      rawValue |= bits[bitIndex] << i;
    }
  }

  return rawValue * signal.factor + signal.offset;
}

/**
 * Decode a CAN frame using DBC message definitions
 */
export function decodeCanFrame(
  frame: CanFrame,
  message: DbcMessage
): Record<string, number> {
  const decoded: Record<string, number> = {};

  // Parse hex data string into byte array
  const hexStr = frame.data.replace(/\s/g, '');
  const dataBytes: number[] = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    dataBytes.push(parseInt(hexStr.substring(i, i + 2), 16));
  }

  for (const signal of message.signals) {
    decoded[signal.name] = extractSignalValue(dataBytes, signal);
  }

  return decoded;
}

/**
 * Default mock DBC content for OBD-II standard PIDs
 */
export const DEFAULT_DBC_CONTENT = `VERSION ""

NS_ :

BS_:

BU_: ECU Dashboard

BO_ 2015 OBD_Request: 8 ECU
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" Dashboard
 SG_ VehicleSpeed : 16|8@1+ (1,0) [0|255] "km/h" Dashboard
 SG_ CoolantTemp : 24|8@1+ (1,-40) [-40|215] "degC" Dashboard
 SG_ ThrottlePosition : 32|8@1+ (0.392,0) [0|100] "%" Dashboard
 SG_ EngineLoad : 40|8@1+ (0.392,0) [0|100] "%" Dashboard

BO_ 2024 OBD_Response_Engine: 8 ECU
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" Dashboard
 SG_ VehicleSpeed : 16|8@1+ (1,0) [0|255] "km/h" Dashboard
 SG_ CoolantTemp : 24|8@1+ (1,-40) [-40|215] "degC" Dashboard
 SG_ ThrottlePosition : 32|8@1+ (0.392,0) [0|100] "%" Dashboard
 SG_ EngineLoad : 40|8@1+ (0.392,0) [0|100] "%" Dashboard

BO_ 2025 OBD_Response_Transmission: 8 ECU
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" Dashboard
 SG_ VehicleSpeed : 16|8@1+ (1,0) [0|255] "km/h" Dashboard
 SG_ CoolantTemp : 24|8@1+ (1,-40) [-40|215] "degC" Dashboard
 SG_ ThrottlePosition : 32|8@1+ (0.392,0) [0|100] "%" Dashboard
 SG_ EngineLoad : 40|8@1+ (0.392,0) [0|100] "%" Dashboard
`;

export const PROBLEMATIC_DBC_CONTENT = `VERSION ""

NS_ :

BS_:

BU_: ECM TCM BCM Sensor1

BO_ 1000 Engine_Control: 8 ECM
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" TCM
 SG_ CoolantTemp : 16|8@1+ (1,-40) [-40|215] "degC" BCM
 SG_ ThrottlePosition : 24|8@1+ (0.392,0) [0|100] "%" BCM
 SG_ EngineRPM : 24|8@1+ (1,0) [0|255] "" TCM

BO_ 1001 Transmission_Status: 8 TCM
 SG_ CurrentGear : 0|4@1+ (1,0) [0|10] "" ECM
 SG_ GearRatio : 4|12@1+ (0.001,0) [0|4.095] "" ECM
 SG_ InputSpeed : 0|16@1+ (0.25,0) [0|16383.75] "rpm" ECM
 SG_ TorqueConverter : 16|16@1+ (0.1,0) [0|6553.5] "Nm" ECM
 SG_ EngineRPM : 16|8@1+ (1,0) [0|255] "rpm" BCM

BO_ 1002 Body_Control: 6 BCM
 SG_ Headlights : 0|1@1+ (1,0) [0|1] "" Sensor1
 SG_ Wipers : 1|1@1+ (1,0) [0|1] "" Sensor1
 SG_ DoorLock : 2|1@1+ (1,0) [0|1] "" Sensor1
 SG_ WindowPos : 8|10@1+ (0.1,0) [0|100] "%" Sensor1
 SG_ MirrorAngle : 10|6@1+ (1,0) [0|60] "deg" Sensor1

BO_ 1003 Sensor_Array: 8 Sensor1
 SG_ Accelerator : 0|16@1+ (0.001,0) [0|1] "" ECM
 SG_ BrakePressure : 32|8@1+ (0.5,0) [0|100] "bar" ECM
 SG_ SteerAngle : 0|16@1+ (0.1,-800) [-800|800] "deg" ECM
 SG_ YawRate : 16|16@1+ (0.01,-327) [-327|327] "deg/s" ECM

BO_ 1004 Undecodable_Msg: 8 BCM
 SG_ MagicData1 : 0|64@1+ (1,0) [0|0] "" ECM
 SG_ MagicData2 : 60|8@1+ (1,0) [0|100] "" ECM

BO_ 1005 Broadcast_All: 8 ECM
 SG_ VehicleSpeed : 0|8@1+ (1,0) [0|255] "km/h" TCM
 SG_ VehicleSpeed : 16|8@1+ (1,0) [0|255] "km/h" BCM
 SG_ FuelLevel : 8|8@1+ (0.4,0) [0|100] "%" BCM
`;

export const UNDEFINED_FRAME_IDS = [0x7E0, 0x7E8, 0x7DF, 0x7EC, 0x7EE, 0x100, 0x101, 0x500, 0x501];
