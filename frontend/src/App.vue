<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCanBusStore } from './store/canbus';
import FrameTable from './components/FrameTable.vue';
import SignalChart from './components/SignalChart.vue';
import ValidationCenter from './components/ValidationCenter.vue';

const store = useCanBusStore();
const rightPanelTab = ref<'chart' | 'validation'>('chart');
const fileInputRef = ref<HTMLInputElement | null>(null);
const importPanelOpen = ref(false);

const totalIssueBadge = computed(() => {
  const n = store.validationResult.totalIssues;
  return n > 99 ? '99+' : n.toString();
});

function handleLoadNormalDbc() {
  store.loadMockDbc();
  store.clearFrames();
  showToast(`已加载标准 DBC: ${store.dbcMessages.size} 条消息定义`, 'success');
}

function handleLoadProblematicDbc() {
  store.loadProblematicDbc();
  store.clearFrames();
  store.runValidation();
  rightPanelTab.value = 'validation';
  showToast(
    `已加载问题 DBC (含重复信号/信号重叠等): ${store.dbcMessages.size} 条定义，已自动切换到校验中心`,
    'warning'
  );
}

function triggerFileUpload() {
  fileInputRef.value?.click();
}

function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  const reader = new FileReader();

  reader.onload = (e) => {
    const text = e.target?.result as string;
    try {
      store.parseAndLoadDbc(text);
      store.clearFrames();
      showToast(
        `已成功导入 DBC 文件 "${file.name}": ${store.dbcMessages.size} 条消息定义`,
        'success'
      );
    } catch (err) {
      showToast(`DBC 文件解析失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error');
    }
  };

  reader.onerror = () => {
    showToast('DBC 文件读取失败', 'error');
  };

  reader.readAsText(file);
  input.value = '';
}

function handleExport() {
  const csv = store.exportFrames();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `can_frames_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
}

const toasts = ref<Toast[]>([]);
let toastIdCounter = 0;

function showToast(message: string, type: Toast['type'] = 'info') {
  const id = ++toastIdCounter;
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 4500);
}

function removeToast(id: number) {
  toasts.value = toasts.value.filter(t => t.id !== id);
}

function getToastClasses(type: Toast['type']): string {
  switch (type) {
    case 'success':
      return 'bg-green-900/90 border-green-700 text-green-200';
    case 'warning':
      return 'bg-yellow-900/90 border-yellow-700 text-yellow-200';
    case 'error':
      return 'bg-red-900/90 border-red-700 text-red-200';
    default:
      return 'bg-blue-900/90 border-blue-700 text-blue-200';
  }
}
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-900 text-gray-100 overflow-hidden relative">
    <!-- Header -->
    <header class="flex items-center justify-between px-6 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-cyan-600 rounded-lg flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </div>
        <h1 class="text-lg font-bold text-gray-100">CAN 总线数据帧解析与诊断仪</h1>
      </div>

      <div class="flex items-center gap-2">
        <!-- Import Dropdown Trigger -->
        <div class="relative">
          <button
            @click="importPanelOpen = !importPanelOpen"
            class="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-sm rounded transition-colors border border-cyan-600 flex items-center gap-1.5 font-medium"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            导入 DBC 定义
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Import Dropdown Panel -->
          <div
            v-if="importPanelOpen"
            class="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-50 overflow-hidden"
          >
            <div class="p-3 border-b border-gray-700">
              <h3 class="text-sm font-semibold text-gray-200">选择 DBC 定义来源</h3>
              <p class="text-xs text-gray-500 mt-0.5">从文件上传或使用内置示例进行体验</p>
            </div>

            <div class="p-2 space-y-1">
              <button
                @click="importPanelOpen = false; triggerFileUpload()"
                class="w-full px-3 py-2.5 text-left rounded hover:bg-gray-700/80 transition-colors flex items-center gap-3 group"
              >
                <div class="w-9 h-9 bg-cyan-900/50 rounded-lg flex items-center justify-center group-hover:bg-cyan-800/50 shrink-0">
                  <svg class="w-4.5 h-4.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-200">上传本地 DBC 文件</div>
                  <div class="text-xs text-gray-500">支持 .dbc / .txt 文本格式</div>
                </div>
              </button>

              <div class="h-px bg-gray-700 my-2"></div>

              <button
                @click="importPanelOpen = false; handleLoadNormalDbc()"
                class="w-full px-3 py-2.5 text-left rounded hover:bg-gray-700/80 transition-colors flex items-center gap-3 group"
              >
                <div class="w-9 h-9 bg-green-900/50 rounded-lg flex items-center justify-center group-hover:bg-green-800/50 shrink-0">
                  <svg class="w-4.5 h-4.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-200">加载标准示例（干净 DBC）</div>
                  <div class="text-xs text-gray-500">OBD-II 标准 PID 定义，校验通过</div>
                </div>
              </button>

              <button
                @click="importPanelOpen = false; handleLoadProblematicDbc()"
                class="w-full px-3 py-2.5 text-left rounded hover:bg-gray-700/80 transition-colors flex items-center gap-3 group"
              >
                <div class="w-9 h-9 bg-amber-900/50 rounded-lg flex items-center justify-center group-hover:bg-amber-800/50 shrink-0">
                  <svg class="w-4.5 h-4.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-amber-300">加载问题示例（触发校验）</div>
                  <div class="text-xs text-gray-500">含重复信号、信号重叠、无法解码帧定义</div>
                </div>
              </button>
            </div>

            <div class="px-3 py-2 bg-gray-850 border-t border-gray-700 text-xs text-gray-500" style="background-color: #1a2234;">
              当前已加载:
              <span class="text-cyan-400 font-medium ml-1">{{ store.dbcMessages.size }} 条消息</span>
            </div>
          </div>
        </div>

        <!-- Hidden File Input -->
        <input
          ref="fileInputRef"
          type="file"
          accept=".dbc,.txt,text/plain"
          class="hidden"
          @change="handleFileSelected"
        />

        <button
          @click="rightPanelTab = 'validation'"
          class="relative px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white text-sm rounded transition-colors border border-amber-600 flex items-center gap-1.5 font-medium"
          :class="{ 'ring-2 ring-amber-400 ring-offset-1 ring-offset-gray-800': store.validationResult.totalIssues > 0 }"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          校验中心
          <span
            v-if="store.validationResult.totalIssues > 0"
            class="ml-0.5 px-1.5 py-0.5 text-xs font-bold rounded-full min-w-[1.25rem] text-center"
            :class="store.hasValidationErrors ? 'bg-red-500 text-white' : 'bg-yellow-400 text-gray-900'"
          >
            {{ totalIssueBadge }}
          </span>
        </button>

        <button
          @click="store.isCapturing ? store.stopCapture() : store.startCapture()"
          class="px-3 py-1.5 text-sm rounded transition-colors font-medium"
          :class="store.isCapturing
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-green-600 hover:bg-green-700 text-white'"
        >
          {{ store.isCapturing ? '停止捕获' : '开始捕获' }}
        </button>

        <button
          @click="store.clearFrames()"
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors border border-gray-600"
        >
          清除
        </button>

        <button
          @click="handleExport"
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors border border-gray-600"
        >
          导出CSV
        </button>
      </div>
    </header>

    <!-- Click-outside overlay for dropdown -->
    <div
      v-if="importPanelOpen"
      class="fixed inset-0 z-40"
      @click="importPanelOpen = false"
    ></div>

    <!-- Main Area -->
    <main class="flex-1 flex overflow-hidden">
      <!-- Left Panel: Frame Table (60%) -->
      <div class="w-3/5 border-r border-gray-700 flex flex-col overflow-hidden">
        <FrameTable />
      </div>

      <!-- Right Panel: Signal Chart / Validation Center (40%) -->
      <div class="w-2/5 flex flex-col overflow-hidden">
        <!-- Tab Bar -->
        <div class="flex bg-gray-800 border-b border-gray-700 shrink-0">
          <button
            @click="rightPanelTab = 'chart'"
            class="flex-1 px-4 py-2 text-sm font-medium transition-colors border-b-2"
            :class="rightPanelTab === 'chart'
              ? 'text-cyan-400 border-cyan-500 bg-gray-800/80'
              : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-700/50'"
          >
            信号图表
          </button>
          <button
            @click="rightPanelTab = 'validation'"
            class="flex-1 px-4 py-2 text-sm font-medium transition-colors border-b-2 relative"
            :class="rightPanelTab === 'validation'
              ? 'text-amber-400 border-amber-500 bg-gray-800/80'
              : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-700/50'"
          >
            校验中心
            <span
              v-if="store.validationResult.totalIssues > 0"
              class="absolute top-1.5 right-3 w-5 h-5 flex items-center justify-center text-xs font-bold rounded-full"
              :class="store.hasValidationErrors ? 'bg-red-600 text-white' : 'bg-yellow-600 text-white'"
            >
              {{ totalIssueBadge }}
            </span>
          </button>
        </div>

        <!-- Tab Content -->
        <div class="flex-1 overflow-hidden">
          <SignalChart v-show="rightPanelTab === 'chart'" />
          <ValidationCenter v-show="rightPanelTab === 'validation'" />
        </div>
      </div>
    </main>

    <!-- Status Bar -->
    <footer class="flex items-center justify-between px-6 py-1.5 bg-gray-800 border-t border-gray-700 text-xs shrink-0">
      <div class="flex items-center gap-4 text-gray-500">
        <span>
          <span :class="store.isCapturing ? 'text-green-400' : 'text-gray-500'">
            ● {{ store.isCapturing ? '捕获中' : '已停止' }}
          </span>
        </span>
        <span>DBC消息: {{ store.dbcMessages.size }}</span>
        <span
          v-if="store.validationResult.totalIssues > 0"
          class="cursor-pointer"
          @click="rightPanelTab = 'validation'"
        >
          <span :class="store.hasValidationErrors ? 'text-red-400' : 'text-yellow-400'">
            ⚠ 校验问题: {{ store.validationResult.totalIssues }}
          </span>
        </span>
      </div>
      <div class="flex items-center gap-4 text-gray-500">
        <span>帧数: {{ store.busStats.totalFrames }}</span>
        <span>RX: {{ store.busStats.rxCount }}</span>
        <span>TX: {{ store.busStats.txCount }}</span>
        <span>负载: {{ store.busLoadPercent }}%</span>
      </div>
    </footer>

    <!-- Toast Container -->
    <div class="fixed top-16 right-6 z-[100] space-y-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto min-w-[240px] max-w-[360px] px-3.5 py-2.5 rounded-lg border shadow-lg backdrop-blur-sm cursor-pointer flex items-start gap-2"
          :class="getToastClasses(toast.type)"
          @click="removeToast(toast.id)"
        >
          <svg v-if="toast.type === 'success'" class="w-4.5 h-4.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <svg v-else-if="toast.type === 'warning'" class="w-4.5 h-4.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <svg v-else-if="toast.type === 'error'" class="w-4.5 h-4.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <svg v-else class="w-4.5 h-4.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-sm leading-relaxed flex-1">{{ toast.message }}</span>
          <button
            class="shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity"
            @click.stop="removeToast(toast.id)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%) scale(0.95);
}
.toast-move {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
