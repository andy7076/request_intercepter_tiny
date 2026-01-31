/**
 * 编辑器搜索替换模块
 * 类似 VSCode 的搜索替换功能
 */

class EditorSearchReplace {
  constructor(textareaId, containerId) {
    this.textarea = document.getElementById(textareaId);
    this.container = document.getElementById(containerId);
    this.searchInput = null;
    this.replaceInput = null;
    this.matchInfo = null;
    this.isVisible = false;
    this.matches = [];
    this.currentMatchIndex = -1;
    this.caseSensitive = false;
    this.useRegex = false;
    this.wholeWord = false;
    this.highlightOverlay = null;
    
    this.init();
  }
  
  init() {
    // 创建高亮覆盖层
    this.createHighlightOverlay();
    // 创建搜索替换 UI
    this.createSearchUI();
    // 绑定快捷键
    this.bindKeyboardShortcuts();
  }
  
  createHighlightOverlay() {
    // 获取 textarea 的父容器
    const textareaParent = this.textarea.parentElement;
    
    // 创建包装器
    const wrapper = document.createElement('div');
    wrapper.className = 'textarea-highlight-wrapper';
    
    // 创建高亮层背景
    const backdrop = document.createElement('div');
    backdrop.className = 'textarea-highlight-backdrop';
    backdrop.id = 'highlight-backdrop';
    
    // 创建高亮内容层
    const highlights = document.createElement('div');
    highlights.className = 'textarea-highlights';
    highlights.id = 'highlight-layer';
    
    backdrop.appendChild(highlights);
    
    // 将 textarea 包装起来
    textareaParent.insertBefore(wrapper, this.textarea);
    wrapper.appendChild(backdrop);
    wrapper.appendChild(this.textarea);
    
    this.highlightOverlay = highlights;
    this.highlightBackdrop = backdrop;
    this.textareaWrapper = wrapper;
    
    // 同步滚动
    this.textarea.addEventListener('scroll', () => {
      this.syncScroll();
    });
    
    // 监听内容变化
    this.textarea.addEventListener('input', () => {
      // 只有在搜索框开启且有搜索内容时才重新搜索
      if (this.isVisible && this.searchInput && this.searchInput.value) {
        this.performSearch(false); // 重新计算匹配位置，但不改变焦点
      } else {
        this.updateHighlights(); // 只是更新高亮层的内容（虽然可能没用，保持兼容）
      }
    });
  }
  
  createSearchUI() {
    const searchWidget = document.createElement('div');
    searchWidget.className = 'search-replace-widget';
    searchWidget.id = 'search-replace-widget';
    searchWidget.innerHTML = `
      <div class="search-replace-container">
        <div class="search-row">
          <div class="search-input-wrapper">
            <input type="text" class="search-input" id="sr-search-input" data-i18n-placeholder="searchPlaceholder" placeholder="Search..." />
            <span class="match-info" id="sr-match-info"></span>
          </div>
          <div class="search-options">
            <button type="button" class="option-btn" id="sr-case-btn" data-i18n-title="caseSensitive" title="Case Sensitive (Alt+C)">Aa</button>
            <button type="button" class="option-btn" id="sr-word-btn" data-i18n-title="wholeWord" title="Whole Word (Alt+W)">ab</button>
            <button type="button" class="option-btn" id="sr-regex-btn" data-i18n-title="regex" title="Regular Expression (Alt+R)">.*</button>
          </div>
          <div class="search-nav">
            <button type="button" class="nav-btn" id="sr-prev-btn" data-i18n-title="prevMatch" title="Previous (Shift+Enter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
            <button type="button" class="nav-btn" id="sr-next-btn" data-i18n-title="nextMatch" title="Next (Enter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
          </div>
          <button type="button" class="close-btn" id="sr-close-btn" data-i18n-title="closeEsc" title="Close (Esc)">×</button>
        </div>
        <div class="replace-row">
          <div class="replace-input-wrapper">
            <input type="text" class="replace-input" id="sr-replace-input" data-i18n-placeholder="replacePlaceholder" placeholder="Replace..." />
          </div>
          <div class="replace-actions">
            <button type="button" class="action-btn" id="sr-replace-btn" data-i18n="replace" title="Replace (Ctrl+Shift+1)">Replace</button>
            <button type="button" class="action-btn" id="sr-replace-all-btn" data-i18n="replaceAll" title="Replace All (Ctrl+Shift+Enter)">Replace All</button>
          </div>
        </div>
      </div>
    `;
    
    this.container.appendChild(searchWidget);
    
    // 获取元素引用
    this.widget = searchWidget;
    this.searchInput = document.getElementById('sr-search-input');
    this.replaceInput = document.getElementById('sr-replace-input');
    this.matchInfo = document.getElementById('sr-match-info');
    this.caseBtn = document.getElementById('sr-case-btn');
    this.wordBtn = document.getElementById('sr-word-btn');
    this.regexBtn = document.getElementById('sr-regex-btn');
    this.prevBtn = document.getElementById('sr-prev-btn');
    this.nextBtn = document.getElementById('sr-next-btn');
    this.replaceBtn = document.getElementById('sr-replace-btn');
    this.replaceAllBtn = document.getElementById('sr-replace-all-btn');
    this.closeBtn = document.getElementById('sr-close-btn');
    
    // 绑定事件
    this.bindEvents();
  }
  
  bindEvents() {
    // 搜索输入事件
    this.searchInput.addEventListener('input', () => this.performSearch());
    
    // 选项按钮
    this.caseBtn.addEventListener('click', () => this.toggleOption('case'));
    this.wordBtn.addEventListener('click', () => this.toggleOption('word'));
    this.regexBtn.addEventListener('click', () => this.toggleOption('regex'));
    
    // 导航按钮
    this.prevBtn.addEventListener('click', () => this.goToPrevMatch());
    this.nextBtn.addEventListener('click', () => this.goToNextMatch());
    
    // 替换按钮
    this.replaceBtn.addEventListener('click', () => this.replaceCurrent());
    this.replaceAllBtn.addEventListener('click', () => this.replaceAll());
    
    // 关闭按钮
    this.closeBtn.addEventListener('click', () => this.hide());
    
    // 回车键导航
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // 保持焦点在输入框，方便连续按 Enter 搜索
        if (e.shiftKey) {
          this.goToPrevMatch(true);
        } else {
          this.goToNextMatch(true);
        }
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });
    
    this.replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });

    // 阻止事件冒泡到模态框
    this.widget.addEventListener('click', (e) => e.stopPropagation());
  }
  
  bindKeyboardShortcuts() {
    this.textarea.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + F: 打开搜索
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        this.show();
      }
      // Ctrl/Cmd + H: 打开搜索替换（聚焦替换输入框）
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        this.show(true);
      }
    });
    
    // 全局 ESC 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }
  
  toggleOption(option) {
    switch(option) {
      case 'case':
        this.caseSensitive = !this.caseSensitive;
        this.caseBtn.classList.toggle('active', this.caseSensitive);
        break;
      case 'word':
        this.wholeWord = !this.wholeWord;
        this.wordBtn.classList.toggle('active', this.wholeWord);
        break;
      case 'regex':
        this.useRegex = !this.useRegex;
        this.regexBtn.classList.toggle('active', this.useRegex);
        break;
    }
    // 切换选项时不自动聚焦
    this.performSearch(false);
  }
  
  performSearch(shouldFocus = false) {
    const searchText = this.searchInput.value;
    const content = this.textarea.value;
    
    this.matches = [];
    this.currentMatchIndex = -1;
    
    if (!searchText) {
      this.updateMatchInfo();
      return;
    }
    
    try {
      let pattern;
      let searchPattern = searchText;
      
      if (!this.useRegex) {
        // 转义正则特殊字符
        searchPattern = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      
      if (this.wholeWord) {
        searchPattern = `\\b${searchPattern}\\b`;
      }
      
      const flags = this.caseSensitive ? 'g' : 'gi';
      pattern = new RegExp(searchPattern, flags);
      
      let match;
      while ((match = pattern.exec(content)) !== null) {
        this.matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0]
        });
        // 防止无限循环（空匹配）
        if (match[0].length === 0) {
          pattern.lastIndex++;
        }
      }
      
      if (this.matches.length > 0) {
        this.currentMatchIndex = 0;
        // 只在需要聚焦时才跳转到匹配位置
        if (shouldFocus) {
          this.highlightCurrentMatch();
        }
      }
    } catch (e) {
      // 无效正则，忽略
      console.warn('Invalid search pattern:', e.message);
    }
    
    this.updateMatchInfo();
    // 更新高亮显示
    this.updateHighlights();
  }
  
  updateMatchInfo() {
    if (this.matches.length === 0) {
      if (this.searchInput.value) {
        this.matchInfo.textContent = window.i18n ? window.i18n.t('noResults') : 'No results';
        this.matchInfo.classList.add('no-results');
      } else {
        this.matchInfo.textContent = '';
        this.matchInfo.classList.remove('no-results');
      }
    } else {
      this.matchInfo.textContent = `${this.currentMatchIndex + 1}/${this.matches.length}`;
      this.matchInfo.classList.remove('no-results');
    }
  }
  
  highlightCurrentMatch(keepFocus = false) {
    if (this.currentMatchIndex < 0 || this.currentMatchIndex >= this.matches.length) {
      return;
    }
    
    const match = this.matches[this.currentMatchIndex];
    
    // 只有在非 keepFocus 模式下才切换焦点到 textarea
    // 但无论如何都要设置选区以触发滚动
    if (!keepFocus) {
      this.textarea.focus();
    }
    
    // 只移动光标到匹配位置开头，不选中范围（避免蓝色背景遮挡自定义高亮）
    this.textarea.setSelectionRange(match.start, match.start);
    
    // 滚动到可见区域
    this.scrollToSelection();
    
    // 如果需要保持焦点在输入框，重新聚焦回去（因为 setSelectionRange 在某些浏览器可能会转移焦点）
    if (keepFocus && this.searchInput) {
      this.searchInput.focus();
    }
  }
  
  scrollToSelection() {
    // 尝试通过高亮层测量精确位置（解决自动换行导致的计算偏差）
    if (this.highlightOverlay) {
      const currentMark = this.highlightOverlay.querySelector('.highlight.current');
      
      if (currentMark) {
        const containerHeight = this.textarea.clientHeight;
        const markTop = currentMark.offsetTop;
        const markHeight = currentMark.offsetHeight;
        
        // 计算居中滚动位置
        // 目标位置 = 元素顶部位置 - (容器高度的一半) + (元素高度的一半)
        let targetScroll = markTop - (containerHeight / 2) + (markHeight / 2);
        
        this.textarea.scrollTop = Math.max(0, targetScroll);
        // 同步背景层的滚动已经在 textarea 的 scroll 事件中处理了，但为了平滑，这里也可以顺手做一下
        // this.highlightBackdrop.scrollTop = this.textarea.scrollTop; 
        return;
      }
    }

    // 后备方案：如果找不到高亮元素（极少数情况），回退到估算
    const textarea = this.textarea;
    const text = textarea.value;
    const selectionStart = textarea.selectionStart;
    
    const textBeforeSelection = text.substring(0, selectionStart);
    const lineNumber = textBeforeSelection.split('\n').length;
    
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 22;
    const visibleLines = textarea.clientHeight / lineHeight;
    const targetScroll = (lineNumber - visibleLines / 2) * lineHeight;
    
    textarea.scrollTop = Math.max(0, targetScroll);
  }
  
  goToNextMatch(keepFocus = false) {
    if (this.matches.length === 0) return;
    
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matches.length;
    
    // 必须先更新高亮层 DOM，确保 .current 类名被移动到正确的元素上
    this.updateHighlights(); 
    this.updateMatchInfo();
    
    // 然后再执行滚动（此时 scrollToSelection 才能在 DOM 中找到正确的新位置）
    this.highlightCurrentMatch(keepFocus); 
  }
  
  goToPrevMatch(keepFocus = false) {
    if (this.matches.length === 0) return;
    
    this.currentMatchIndex = (this.currentMatchIndex - 1 + this.matches.length) % this.matches.length;
    
    // 必须先更新高亮层 DOM
    this.updateHighlights(); 
    this.updateMatchInfo();
    
    // 然后再执行滚动
    this.highlightCurrentMatch(keepFocus); 
  }
  
  replaceCurrent() {
    if (this.matches.length === 0 || this.currentMatchIndex < 0) return;
    
    const match = this.matches[this.currentMatchIndex];
    const content = this.textarea.value;
    const replaceText = this.replaceInput.value;
    
    // 执行替换
    const newContent = content.substring(0, match.start) + 
                       replaceText + 
                       content.substring(match.end);
    
    this.textarea.value = newContent;
    
    // 触发 input 事件以便其他监听器可以响应
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 重新搜索
    this.performSearch();
    
    // 如果还有匹配项，高亮当前位置的匹配
    if (this.matches.length > 0) {
      // 调整索引（因为替换可能导致位置变化）
      if (this.currentMatchIndex >= this.matches.length) {
        this.currentMatchIndex = 0;
      }
      this.highlightCurrentMatch();
    }
  }
  
  replaceAll() {
    if (this.matches.length === 0) return;
    
    const searchText = this.searchInput.value;
    const replaceText = this.replaceInput.value;
    const content = this.textarea.value;
    const matchCount = this.matches.length;
    
    try {
      let searchPattern = searchText;
      
      if (!this.useRegex) {
        searchPattern = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      
      if (this.wholeWord) {
        searchPattern = `\\b${searchPattern}\\b`;
      }
      
      const flags = this.caseSensitive ? 'g' : 'gi';
      const pattern = new RegExp(searchPattern, flags);
      
      const newContent = content.replace(pattern, replaceText);
      this.textarea.value = newContent;
      
      // 触发 input 事件
      this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // 重新搜索（应该没有结果了）
      this.performSearch();
      
      // 显示替换完成提示
      this.showToast(window.i18n ? window.i18n.t('replacedCount', matchCount) : `Replaced ${matchCount} occurrences`);
    } catch (e) {
      console.error('[Request Interceptor Tiny]', 'Replace failed:', e);
    }
  }
  
  showToast(message) {
    // 复用主页面的 toast 功能
    if (typeof showToast === 'function') {
      showToast(message);
    } else {
      console.log(message);
    }
  }
  
  show(focusReplace = false) {
    this.widget.classList.add('active');
    this.isVisible = true;
    
    // Apply i18n translations to dynamically created elements
    if (window.i18n && window.i18n.applyTranslations) {
      window.i18n.applyTranslations();
    }
    
    // 如果有选中文本，用作搜索词
    const selectedText = this.textarea.value.substring(
      this.textarea.selectionStart,
      this.textarea.selectionEnd
    );
    
    if (selectedText && selectedText.length < 100) {
      this.searchInput.value = selectedText;
      // 打开时不自动聚焦到匹配项，保持搜索框焦点
      this.performSearch(false);
    } else {
      // 没有任何选中时，确保输入框是空的（对应"关闭时清空"的需求，防止上次残留）
      this.searchInput.value = '';
      this.performSearch(false); // Update UI to empty state
    }
    
    if (focusReplace) {
      this.replaceInput.focus();
    } else {
      this.searchInput.focus();
      this.searchInput.select();
    }
  }
  
  hide() {
    this.widget.classList.remove('active');
    this.isVisible = false;
    
    // 清空输入框内容
    if (this.searchInput) this.searchInput.value = '';
    if (this.replaceInput) this.replaceInput.value = '';
    if (this.matchInfo) {
      this.matchInfo.textContent = '';
      this.matchInfo.classList.remove('no-results');
    }
    
    this.matches = [];
    this.currentMatchIndex = -1;
    
    // 清除高亮
    this.clearHighlights();
    this.textarea.focus();
  }
  
  // 更新高亮显示
  updateHighlights() {
    if (!this.highlightOverlay) return;
    
    const content = this.textarea.value;
    const searchText = this.searchInput ? this.searchInput.value : '';
    
    if (!searchText || this.matches.length === 0) {
      this.clearHighlights();
      return;
    }
    
    // 构建带高亮的 HTML
    let html = '';
    let lastIndex = 0;
    
    this.matches.forEach((match, index) => {
      // 添加匹配前的文本
      html += this.escapeHtml(content.substring(lastIndex, match.start));
      // 添加高亮的匹配文本
      const isCurrentMatch = index === this.currentMatchIndex;
      const highlightClass = isCurrentMatch ? 'highlight current' : 'highlight';
      html += `<mark class="${highlightClass}">${this.escapeHtml(match.text)}</mark>`;
      lastIndex = match.end;
    });
    
    // 添加最后一段文本
    html += this.escapeHtml(content.substring(lastIndex));
    
    // 保留换行符和空格
    html = html.replace(/\n/g, '<br>');
    
    this.highlightOverlay.innerHTML = html;
    this.syncScroll();
  }
  
  // 清除所有高亮
  clearHighlights() {
    if (this.highlightOverlay) {
      this.highlightOverlay.innerHTML = '';
    }
  }
  
  // 同步 textarea 和高亮层的滚动
  syncScroll() {
    if (this.highlightBackdrop && this.textarea) {
      this.highlightBackdrop.scrollTop = this.textarea.scrollTop;
      this.highlightBackdrop.scrollLeft = this.textarea.scrollLeft;
    }
  }
  
  // HTML 转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // 更新 textarea 引用（用于模态框切换时）
  setTextarea(textareaId) {
    this.textarea = document.getElementById(textareaId);
    this.bindKeyboardShortcuts();
    this.performSearch();
  }
}

// 导出到全局
window.EditorSearchReplace = EditorSearchReplace;
