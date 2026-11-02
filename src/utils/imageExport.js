/**
 * 将Canvas导出为图片并下载
 * 兼容处理移动端大图导出问题
 * @param {HTMLCanvasElement} canvas - canvas元素
 * @param {string} filename - 文件名
 */
export const downloadCanvasAsImage = (canvas, filename) => {
  try {
    // 优先尝试使用 toBlob，因为它处理大文件更有效率且不容易崩溃
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) {
          console.error("Canvas转换Blob失败");
          fallbackToDataURL(canvas, filename);
          return;
        }

        // 电脑端 Chrome 也有 navigator.share，会弹出系统分享窗口，这个窗口会把桌面卡死。
        // 只有手机才走分享，电脑直接下载。
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(
          navigator.userAgent,
        );
        const file = new File([blob], filename, { type: blob.type });
        if (
          isMobile &&
          navigator.share &&
          navigator.canShare &&
          navigator.canShare({ files: [file] })
        ) {
          navigator
            .share({
              files: [file],
              title: "分享图片",
              text: filename,
            })
            .catch((err) => {
              console.log("分享失败，尝试下载:", err);
              downloadBlob(blob, filename);
            });
        } else {
          downloadBlob(blob, filename);
        }
      }, "image/png");
    } else {
      fallbackToDataURL(canvas, filename);
    }
  } catch (e) {
    console.error("导出图片出错:", e);
    fallbackToDataURL(canvas, filename);
  }
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  // 兼容某些移动端浏览器，添加到body
  document.body.appendChild(link);

  try {
    link.click();
  } catch (e) {
    console.error("Link click failed", e);
  }

  // 清理
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

const fallbackToDataURL = (canvas, filename) => {
  try {
    const imgUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = imgUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.error("DataURL导出失败:", e);
    // eslint-disable-next-line no-alert -- Preserve the existing native notification or confirmation flow.
    alert("导出图片失败，图片可能过大");
  }
};
