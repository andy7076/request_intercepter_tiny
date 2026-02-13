/**
 * 全局悬浮提示模块
 * 管理按钮的 Tooltip 提示
 */

// 初始化全局悬浮提示
function initGlobalTooltip() {
  // 创建提示元素
  let tooltip = document.getElementById('global-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'global-tooltip';
    tooltip.className = 'global-tooltip';
    document.body.appendChild(tooltip);
  }

  // 事件委托处理鼠标悬停
  document.body.addEventListener('mouseover', (e) => {
    // 查找最近的带有 title 或 data-tooltip 的目标元素
    // 同时必须是指定的按钮类型
    const target = e.target.closest('.btn-icon, .btn-icon-small, .btn-open-tab, .rule-toggle, .btn-icon-header, .btn-expand');

    if (!target) return;

    // 处理 title 属性（防止原生提示并获取内容）
    let text = target.getAttribute('data-tooltip');
    if (!text && target.hasAttribute('title')) {
      text = target.getAttribute('title');
      target.setAttribute('data-tooltip', text);
      target.removeAttribute('title');
    }

    if (text) {
      const rect = target.getBoundingClientRect();

      tooltip.textContent = text;

      // 先显示 tooltip 获取其宽度（但保持透明）
      tooltip.style.visibility = 'hidden';
      tooltip.style.display = 'block';
      const tooltipWidth = tooltip.offsetWidth;
      tooltip.style.visibility = '';
      tooltip.style.display = '';

      // Determine position (default top, switch to bottom if too close to top edge)
      const spaceAbove = rect.top;
      const isTooCloseToTop = spaceAbove < 40; // Threshold for switching direction

      // 计算水平位置，确保不超出右边界
      let left = rect.left + rect.width / 2;
      const viewportWidth = window.innerWidth;
      const rightEdge = left + tooltipWidth / 2;
      const leftEdge = left - tooltipWidth / 2;

      // 调整水平偏移
      let offsetX = 0;
      if (rightEdge > viewportWidth - 8) {
        // 超出右边界，向左偏移
        offsetX = viewportWidth - 8 - rightEdge;
      } else if (leftEdge < 8) {
        // 超出左边界，向右偏移
        offsetX = 8 - leftEdge;
      }

      // 设置偏移量作为 CSS 变量，用于调整箭头位置
      tooltip.style.setProperty('--arrow-offset', `${-offsetX}px`);
      left += offsetX;

      if (isTooCloseToTop) {
        tooltip.classList.add('bottom');
        // Position below
        const top = rect.bottom;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      } else {
        tooltip.classList.remove('bottom');
        // Position above
        const top = rect.top;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      }

      tooltip.classList.add('visible');
    }
  });

  // 鼠标移出时隐藏
  document.body.addEventListener('mouseout', (e) => {
    const target = e.target.closest('.btn-icon, .btn-icon-small, .btn-open-tab, .rule-toggle, .btn-icon-header, .btn-expand');
    if (target) {
      tooltip.classList.remove('visible');
    }
  });

  // 滚动时隐藏，防止位置错乱
  document.addEventListener('scroll', () => {
    tooltip.classList.remove('visible');
  }, true);
}

// 导出到全局
window.App = window.App || {};
window.App.tooltip = {
  initGlobalTooltip
};
