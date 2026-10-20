/**
 * 极简 DOM 构造器。
 *
 * 预览刻意**不引入前端框架**：三端壳还没定，UI 用什么写都是暂时的，
 * 只有数据层是长期的。用一个小 h() 就够把信息架构画清楚。
 */
export type Child = Node | string | number | null | undefined | false;

export interface ElProps {
  class?: string;
  text?: string;
  /** 仅用于**受信任的静态片段**（本项目只用来插内联 SVG 图标），不要放用户数据 */
  html?: string;
  style?: Partial<CSSStyleDeclaration>;
  onClick?: (event: MouseEvent) => void;
  /** 其余字符串/数字属性直接 setAttribute；`data-*` / `aria-*` 也走这里 */
  [attr: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") {
      el.className = String(value);
    } else if (key === "text") {
      el.textContent = String(value);
    } else if (key === "html") {
      el.innerHTML = String(value);
    } else if (key === "style" && typeof value === "object") {
      Object.assign(el.style, value as Partial<CSSStyleDeclaration>);
    } else if (key === "onClick" && typeof value === "function") {
      el.addEventListener("click", value as EventListener);
    } else {
      el.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "number" ? String(child) : (child as Node | string));
  }

  return el;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
