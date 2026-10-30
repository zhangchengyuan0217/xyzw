<template>
  <MyCard
    class="study"
    :status-class="{ weekly: true, completed: study.isCompleted }"
  >
    <template #icon>
      <img src="/icons/1736425783912140.png" alt="学习图标" />
    </template>
    <template #title>
      <h3>咸鱼大冲关</h3>
    </template>
    <template #badge>
      <span>每周</span>
    </template>
    <template #default>
      <p class="study-status">{{ studyStatusText }}</p>
    </template>
    <template #action>
      <a-button v-if="!study.thisWeek" status="primary" @click="startStudy">
        一键答题
      </a-button>
      <a-button
        v-if="!study.thisWeek && isSameGameValue(study.status, 'starting')"
        status="warning"
        :disabled="true"
      >
        正在获取题库...
      </a-button>
      <a-button
        v-if="!study.thisWeek && isSameGameValue(study.status, 'answering')"
        status="warning"
        :disabled="true"
      >
        答题中...
      </a-button>
      <a-button
        v-if="
          !study.thisWeek && isSameGameValue(study.status, 'claiming_rewards')
        "
        status="warning"
        :disabled="true"
      >
        正在领取奖励...
      </a-button>
      <a-button
        v-if="!study.thisWeek && isSameGameValue(study.status, 'completed')"
        status="warning"
        :disabled="true"
      >
        答题完成
      </a-button>
      <a-button v-if="study.thisWeek" status="success" :disabled="true">
        ✅ 已完成无需作答
      </a-button>
    </template>
  </MyCard>
</template>

<script setup>
import { useMessage } from "naive-ui";

import { computed } from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import { isSameGameValue } from "@/utils/gameValue.js";
import {
  getQuestionCount,
  preloadQuestions,
} from "@/utils/studyQuestionsFromJSON.js";
import MyCard from "../Common/MyCard.vue";

const tokenStore = useTokenStore();
const message = useMessage();
const study = computed(() => tokenStore.gameData.studyStatus);

const studyStatusText = computed(() => {
  if (study.value.thisWeek) return "本周已完成";
  if (isSameGameValue(study.value.status, "starting")) return "正在获取题库";
  if (isSameGameValue(study.value.status, "answering")) return "答题中";
  if (isSameGameValue(study.value.status, "claiming_rewards"))
    return "正在领取奖励";
  if (isSameGameValue(study.value.status, "completed")) return "答题完成";
  return "本周尚未作答";
});

const startStudy = async () => {
  if (!tokenStore.selectedToken || study.value.thisWeek) return;
  if (
    !isSameGameValue(study.value.status, "") &&
    !isSameGameValue(study.value.status, "idel")
  )
    return;
  console.log("开始答题", study.value);

  study.value.status = "starting";
  await preloadQuestions();
  study.value.status = "answering";
  const questionCount = await getQuestionCount();
  message.info(`🚀 开始一键答题... (题库包含 ${questionCount} 道题目)`);

  if (study.value.isCompleted)
    return message.success("✅ 咸鱼大冲关任务已完成，无需重复作答！");
  try {
    tokenStore.gameData.studyStatus = {
      ...tokenStore.gameData.studyStatus,
      isAnswering: true,
      questionCount: 0,
      answeredCount: 0,
      status: "starting",
      timestamp: Date.now(),
    };
    const tokenId = tokenStore.selectedToken.id;
    tokenStore.sendMessage(tokenId, "study_startgame");
    setTimeout(() => {
      if (tokenStore.gameData.studyStatus.isAnswering) {
        tokenStore.gameData.studyStatus = {
          ...tokenStore.gameData.studyStatus,
          isAnswering: false,
          questionCount: 0,
          answeredCount: 0,
          status: "",
          timestamp: null,
        };
        message.warning("答题超时，已自动重置状态");
      }
    }, 40000);
    message.info(`🚀 开始一键答题... (题库包含 ${questionCount} 道题目)`);
  } catch (error) {
    console.error("启动答题失败:", error);
    message.error(`启动答题失败: ${error.message}`);
  }
};
</script>

<style scoped lang="scss">
.study {
  min-height: 0;

  &:hover {
    transform: none;
  }

  :deep(.card-header) {
    align-items: center;
    margin-bottom: 8px;
  }

  :deep(.status-title h3) {
    margin-bottom: 0;
  }

  :deep(.card-content) {
    margin-bottom: 8px;
  }

  :deep(.card-action > button) {
    min-height: 36px;
  }
}

.study-status {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
