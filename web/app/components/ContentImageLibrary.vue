<script setup lang="ts">
import { contentImageError } from '~/utils/content-image'

defineProps<{ source: string, disabled?: boolean }>()
const emit = defineEmits<{ insert: [snippet: string], close: [] }>()
const offset = ref(0)
const busy = ref(false)
const message = ref('')
const { data, error, refresh } = useFetch<{ items: { id: string, size: number, used: boolean }[], usedBytes: number, hasMore: boolean }>('/api/my/images', { query: { offset } })
async function remove(id: string) {
  if (!window.confirm('この画像をストレージから削除します。元に戻せません。削除しますか？')) return
  busy.value = true
  message.value = ''
  try {
    await $fetch(`/api/my/images/${id}`, { method: 'DELETE' })
    if (data.value?.items.length === 1 && offset.value > 0) offset.value = Math.max(0, offset.value - 50)
    await refresh()
  } catch (error) { message.value = contentImageError(error) }
  finally { busy.value = false }
}
</script>

<template>
  <section class="image-library" aria-label="保存した画像">
    <div class="image-library-heading">
      <strong>保存した画像</strong>
      <span v-if="data">使用量 {{ (data.usedBytes / 1024 / 1024).toFixed(1) }} MB</span>
      <button type="button" class="editor-button" @click="emit('close')">閉じる</button>
    </div>
    <p>画像を削除するには、使用中の本文から参照を外し、保存・公開内容を更新してください。</p>
    <p v-if="error || message" role="alert">{{ message || '画像一覧を取得できませんでした。' }}</p>
    <div class="image-library-items">
      <div v-for="item in data?.items" :key="item.id" class="image-library-item">
        <img :src="`/api/images/${item.id}`" alt="保存した画像のプレビュー" loading="lazy">
        <span>{{ Math.ceil(item.size / 1024) }} KB</span>
        <button type="button" class="editor-button" :disabled="disabled || busy" @click="emit('insert', `![画像の説明](/api/images/${item.id})`)">挿入</button>
        <button type="button" class="editor-button" :disabled="disabled || busy || item.used || source.includes(`/api/images/${item.id}`)" @click="remove(item.id)">削除</button>
      </div>
    </div>
    <p v-if="data && !data.items.length">保存した画像はありません。</p>
    <button v-if="offset" type="button" class="editor-button" :disabled="busy" @click="offset -= 50">前へ</button>
    <button v-if="data?.hasMore" type="button" class="editor-button" :disabled="busy" @click="offset += 50">次へ</button>
  </section>
</template>

<style scoped>
.image-library { padding: 12px 16px; border-bottom: 1px solid var(--color-line); overflow: auto; max-height: 300px; font-size: .8rem; }
.image-library-heading { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.image-library-items { display: flex; gap: 12px; flex-wrap: wrap; }
.image-library-item { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; width: 150px; }
.image-library-item img { width: 150px; height: 90px; object-fit: contain; }
</style>
