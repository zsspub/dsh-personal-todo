import { TODO_SOURCE } from "./input-source.js";
// 与侧栏的 Lucide ListTodo 图标保持一致。
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 5h8M13 12h8M13 19h8m-18-2 2 2 4-4"/><rect x="3" y="4" width="6" height="6" rx="1"/></svg>`;
/** 宿主仅支持内置引用图标；限定到待办来源，保留原有图标尺寸和语义。 */
export function installTodoInputIcon() {
    if (typeof document === 'undefined')
        return () => { };
    const selectors = [
        `[data-trigger-menu] [role="option"][id^="dsh-slash-option-${TODO_SOURCE}-"] > span[aria-hidden] > svg`,
        `[data-composer-chip="${TODO_SOURCE}"] > span > svg`,
    ];
    const style = document.createElement('style');
    style.dataset.todoInputIcon = '';
    style.textContent = `
${selectors.join(',')} {
  background-color: currentColor;
  mask: url("data:image/svg+xml,${encodeURIComponent(icon)}") center / contain no-repeat;
}
${selectors.map(selector => `${selector} > *`).join(',')} { display: none; }
`;
    document.head.append(style);
    return () => { style.remove(); };
}
//# sourceMappingURL=input-source-icon.js.map
