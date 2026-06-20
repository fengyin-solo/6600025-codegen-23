<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCanBusStore } from '../store/canbus';
import { sortIssuesBySeverity, filterIssuesBySeverity, filterIssuesByCategory } from '../utils/validation';
import type { ValidationIssue, ValidationCategory, ValidationSeverity } from '../types';

const store = useCanBusStore();

const severityFilter = ref<string>('all');
const categoryFilter = ref<string>('all');
const expandedIssueId = ref<string | null>(null);

const sortedIssues = computed(() => {
  return sortIssuesBySeverity(store.validationResult.issues);
});

const filteredIssues = computed(() => {
  let result = sortedIssues.value;
  result = filterIssuesBySeverity(result, severityFilter.value);
  result = filterIssuesByCategory(result, categoryFilter.value);
  return result;
});

function toggleIssue(id: string) {
  expandedIssueId.value = expandedIssueId.value === id ? null : id;
}

function formatTime(ts: number): string {
  if (!ts) return 'N/A';
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + d.getMilliseconds().toString().padStart(3, '0');
}

function getSeverityIcon(severity: ValidationSeverity): string {
  switch (severity) {
    case 'error': return '✕';
    case 'warning': return '⚠';
    case 'info': return 'ℹ';
    default: return '•';
  }
}

function getSeverityColor(severity: ValidationSeverity): string {
  switch (severity) {
    case 'error': return 'text-red-400 bg-red-900/30 border-red-700';
    case 'warning': return 'text-yellow-400 bg-yellow-900/30 border-yellow-700';
    case 'info': return 'text-blue-400 bg-blue-900/30 border-blue-700';
    default: return 'text-gray-400 bg-gray-800 border-gray-600';
  }
}

function getSeverityBadgeColor(severity: ValidationSeverity): string {
  switch (severity) {
    case 'error': return 'bg-red-600 text-white';
    case 'warning': return 'bg-yellow-600 text-white';
    case 'info': return 'bg-blue-600 text-white';
    default: return 'bg-gray-600 text-white';
  }
}

function getCategoryLabel(category: ValidationCategory): string {
  const labels: Record<ValidationCategory, string> = {
    missing_definition: '缺失定义',
    duplicate_signal: '重复信号',
    undecodable_frame: '无法解码',
    signal_overlap: '信号重叠',
    invalid_dlc: 'DLC 不匹配',
    value_out_of_range: '值超范围'
  };
  return labels[category] || category;
}

const categoryOptions: { value: ValidationCategory | 'all'; label: string }[] = [
  { value: 'all', label: '全部分类' },
  { value: 'missing_definition', label: '缺失定义' },
  { value: 'duplicate_signal', label: '重复信号' },
  { value: 'undecodable_frame', label: '无法解码' },
  { value: 'signal_overlap', label: '信号重叠' },
  { value: 'invalid_dlc', label: 'DLC 不匹配' },
  { value: 'value_out_of_range', label: '值超范围' }
];

const severityOptions: { value: ValidationSeverity | 'all'; label: string }[] = [
  { value: 'all', label: '全部级别' },
  { value: 'error', label: '错误' },
  { value: 'warning', label: '警告' },
  { value: 'info', label: '提示' }
];

function handleRefresh() {
  store.runValidation();
}

function handleAutoValidateToggle() {
  store.toggleAutoValidate(!store.autoValidate);
}
</script>

<template>
  <div class="flex flex-col h-full bg-gray-900">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 bg-amber-600 rounded-md flex items-center justify-center">
          <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="text-sm font-semibold text-gray-100">定义导入校验中心</h2>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="handleAutoValidateToggle"
          class="px-2 py-1 text-xs rounded transition-colors"
          :class="store.autoValidate
            ? 'bg-green-900/50 text-green-400 border border-green-700'
            : 'bg-gray-700 text-gray-400 border border-gray-600'"
        >
          {{ store.autoValidate ? '自动校验中' : '自动校验已关' }}
        </button>
        <button
          @click="handleRefresh"
          class="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors border border-gray-600"
        >
          立即校验
        </button>
      </div>
    </div>

    <!-- Summary Stats -->
    <div class="grid grid-cols-3 gap-2 p-3 bg-gray-800/50 border-b border-gray-700">
      <div class="text-center p-2 bg-gray-800 rounded-lg border border-gray-700">
        <div class="text-xl font-bold text-red-400 font-mono">{{ store.validationResult.errorCount }}</div>
        <div class="text-xs text-gray-500">错误</div>
      </div>
      <div class="text-center p-2 bg-gray-800 rounded-lg border border-gray-700">
        <div class="text-xl font-bold text-yellow-400 font-mono">{{ store.validationResult.warningCount }}</div>
        <div class="text-xs text-gray-500">警告</div>
      </div>
      <div class="text-center p-2 bg-gray-800 rounded-lg border border-gray-700">
        <div class="text-xl font-bold text-blue-400 font-mono">{{ store.validationResult.infoCount }}</div>
        <div class="text-xs text-gray-500">提示</div>
      </div>
    </div>

    <!-- Category Summary -->
    <div class="grid grid-cols-2 gap-1 px-3 py-2 bg-gray-800/30 border-b border-gray-700">
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">缺失定义:</span>
        <span class="text-yellow-400 font-mono font-medium">{{ store.validationSummary.missingDefinitions }}</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">重复信号:</span>
        <span class="text-yellow-400 font-mono font-medium">{{ store.validationSummary.duplicateSignals }}</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">无法解码:</span>
        <span class="text-red-400 font-mono font-medium">{{ store.validationSummary.undecodableFrames }}</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">信号重叠:</span>
        <span class="text-red-400 font-mono font-medium">{{ store.validationSummary.signalOverlaps }}</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">DLC不匹配:</span>
        <span class="text-yellow-400 font-mono font-medium">{{ store.validationSummary.invalidDlcs }}</span>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">值超范围:</span>
        <span class="text-blue-400 font-mono font-medium">{{ store.validationSummary.valueOutOfRanges }}</span>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex gap-2 px-3 py-2 bg-gray-800/30 border-b border-gray-700">
      <select
        v-model="severityFilter"
        class="flex-1 px-2 py-1.5 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-cyan-500"
      >
        <option v-for="opt in severityOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <select
        v-model="categoryFilter"
        class="flex-1 px-2 py-1.5 text-xs bg-gray-900 border border-gray-600 rounded text-gray-300 focus:outline-none focus:border-cyan-500"
      >
        <option v-for="opt in categoryOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
    </div>

    <!-- Issue List -->
    <div class="flex-1 overflow-auto">
      <div v-if="filteredIssues.length === 0" class="flex flex-col items-center justify-center h-full text-gray-500 p-6">
        <svg class="w-12 h-12 mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm">暂无校验问题</p>
        <p class="text-xs text-gray-600 mt-1">DBC 定义与数据帧均通过校验</p>
      </div>

      <div v-else class="divide-y divide-gray-800">
        <div
          v-for="issue in filteredIssues"
          :key="issue.id"
          class="px-3 py-2 cursor-pointer transition-colors"
          :class="[
            expandedIssueId === issue.id ? 'bg-gray-800/70' : 'hover:bg-gray-800/40'
          ]"
          @click="toggleIssue(issue.id)"
        >
          <!-- Issue Header -->
          <div class="flex items-start gap-2">
            <div
              class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-sm font-bold mt-0.5"
              :class="getSeverityColor(issue.severity)"
            >
              {{ getSeverityIcon(issue.severity) }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-200 truncate">{{ issue.title }}</span>
                <span
                  class="shrink-0 px-1.5 py-0.5 text-xs rounded font-medium"
                  :class="getSeverityBadgeColor(issue.severity)"
                >
                  {{ getCategoryLabel(issue.category) }}
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-0.5 line-clamp-2">{{ issue.description }}</p>
            </div>
            <svg
              class="w-4 h-4 text-gray-500 shrink-0 mt-1 transition-transform"
              :class="{ 'rotate-180': expandedIssueId === issue.id }"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <!-- Expanded Details -->
          <div v-if="expandedIssueId === issue.id" class="mt-3 ml-8 space-y-3">
            <div class="bg-gray-900 rounded-lg p-3 border border-gray-700">
              <div class="text-xs font-medium text-gray-400 mb-1.5">问题描述</div>
              <p class="text-sm text-gray-300">{{ issue.description }}</p>
            </div>

            <div class="bg-amber-900/20 rounded-lg p-3 border border-amber-800/50">
              <div class="flex items-center gap-1.5 text-xs font-medium text-amber-400 mb-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                处理建议
              </div>
              <p class="text-sm text-amber-200/90">{{ issue.suggestion }}</p>
            </div>

            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span v-if="issue.messageId !== undefined">
                消息ID: <span class="text-cyan-400 font-mono">0x{{ issue.messageId.toString(16).toUpperCase() }}</span>
              </span>
              <span v-if="issue.signalName">
                信号: <span class="text-yellow-400">{{ issue.signalName }}</span>
              </span>
              <span v-if="issue.timestamp">
                时间: <span class="text-gray-400">{{ formatTime(issue.timestamp) }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between px-4 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-500">
      <span>共 {{ store.validationResult.totalIssues }} 个问题</span>
      <span v-if="store.validationResult.lastValidated > 0">
        上次校验: {{ formatTime(store.validationResult.lastValidated) }}
      </span>
    </div>
  </div>
</template>
