<template>
  <div v-if="roles.length" class="pending-roles">
    <div class="pending-roles__title">待添加 {{ roles.length }} 个</div>
    <div
      v-for="(role, index) in roles"
      :key="role.id || index"
      class="pending-role"
    >
      <div class="pending-role__main">
        <div class="pending-role__name">{{ role.name || "未命名角色" }}</div>
        <div class="pending-role__meta">
          <span v-if="role.server">{{ role.server }}</span>
          <span v-if="role.roleIndex !== undefined && role.roleIndex !== null">
            序号 {{ role.roleIndex }}
          </span>
        </div>
      </div>
      <NButton
        v-if="removable"
        size="small"
        quaternary
        type="error"
        @click="emit('remove', index)"
      >
        移除
      </NButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { NButton } from "naive-ui";

withDefaults(
  defineProps<{
    roles: Array<{
      id?: string;
      name?: string;
      server?: string;
      roleIndex?: number;
    }>;
    removable?: boolean;
  }>(),
  { removable: true },
);

const emit = defineEmits<{
  remove: [index: number];
}>();
</script>

<style scoped lang="scss">
.pending-roles {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pending-roles__title {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.pending-role {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--border-radius-medium);
  background: var(--bg-primary);
}

.pending-role__main {
  min-width: 0;
  flex: 1;
}

.pending-role__name {
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
  line-height: 1.4;
  word-break: break-all;
}

.pending-role__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}
</style>
