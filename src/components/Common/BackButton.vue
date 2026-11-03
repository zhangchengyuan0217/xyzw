<template>
  <button type="button" class="back-button" @click="onClick">
    <span class="back-arrow" aria-hidden="true">←</span>
    <span>{{ label }}</span>
  </button>
</template>

<script setup>
import { useRouter } from "vue-router";

const props = defineProps({
  label: {
    type: String,
    default: "返回",
  },
  fallback: {
    type: String,
    default: "/admin/dashboard",
  },
  to: {
    type: [String, Object],
    default: "",
  },
});

const emit = defineEmits(["click"]);
const router = useRouter();

const onClick = (event) => {
  emit("click", event);
  if (event.defaultPrevented) return;
  if (props.to) {
    router.push(props.to);
    return;
  }
  if (window.history.state?.back) router.back();
  else if (props.fallback) router.push(props.fallback);
};
</script>

<style scoped>
.back-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 8px 4px;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.back-arrow {
  font-size: 20px;
  line-height: 1;
}
</style>
