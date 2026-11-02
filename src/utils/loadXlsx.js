let xlsxPromise;

export function loadXlsx() {
  xlsxPromise ??= import("xlsx").then((mod) => {
    const lib = mod.default ?? mod;
    if (typeof lib.writeFile === "function") return lib;
    if (typeof mod.writeFile === "function") return mod;
    throw new Error("xlsx 模块加载失败");
  });
  return xlsxPromise;
}
