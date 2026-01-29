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
    
    this.init();
  }
  
  init() {
    // 创建搜索替换 UI
    this.createSearchUI();
    // 绑定快捷键
    this.bindKeyboardShortcuts();
  }
  
  createSearchUI() {
    const searchWidget = document.createElement('div');
    searchWidget.className = 'search-replace-widget';
    searchWidget.id = 'search-replace-widget';
    searchWidget.innerHTML = `
      <div class="search-replace-container">
        <div class="search-row">
          <div class="search-input-wrapper">
            <input type="text" class="search-input" id="sr-search-input" placeholder="搜索..." />
            <span class="match-info" id="sr-match-info"></span>
          </div>
          <div class="search-options">
            <button type="button" class="option-btn" id="sr-case-btn" title="区分大小写 (Alt+C)">Aa</button>
            <button type="button" class="option-btn" id="sr-word-btn" title="全字匹配 (Alt+W)">ab</button>
            <button type="button" class="option-btn" id="sr-regex-btn" title="正则表达式 (Alt+R)">.*</button>
          </div>
          <div class="search-nav">
            <button type="button" class="nav-btn" id="sr-prev-btn" title="上一个 (Shift+Enter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
            <button type="button" class="nav-btn" id="sr-next-btn" title="下一个 (Enter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
          </div>
          <button type="button" class="close-btn" id="sr-close-btn" title="关闭 (Esc)">×</button>
        </div>
        <div class="replace-row">
          <div class="replace-input-wrapper">
            <input type="text" class="replace-input" id="sr-replace-input" placeholder="替换..." />
          </div>
          <div class="replace-actions">
            <button type="button" class="action-btn" id="sr-replace-btn" title="替换 (Ctrl+Shift+1)">替换</button>
            <button type="button" class="action-btn" id="sr-replace-all-btn" title="全部替换 (Ctrl+Shift+Enter)">全部替换</button>
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
        if (e.shiftKey) {
          this.goToPrevMatch();
        } else {
          this.goToNextMatch();
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
        // 只在需要聚焦时才高亮（例如点击导航按钮时）
        if (shouldFocus) {
          this.highlightCurrentMatch();
        }
      }
    } catch (e) {
      // 无效正则，忽略
      console.warn('搜索模式无效:', e.message);
    }
    
    this.updateMatchInfo();
  }
  
  updateMatchInfo() {
    if (this.matches.length === 0) {
      if (this.searchInput.value) {
        this.matchInfo.textContent = '无结果';
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
  
  highlightCurrentMatch() {
    if (this.currentMatchIndex < 0 || this.currentMatchIndex >= this.matches.length) {
      return;
    }
    
    const match = this.matches[this.currentMatchIndex];
    this.textarea.focus();
    this.textarea.setSelectionRange(match.start, match.end);
    
    // 滚动到可见区域
    this.scrollToSelection();
  }
  
  scrollToSelection() {
    const textarea = this.textarea;
    const text = textarea.value;
    const selectionStart = textarea.selectionStart;
    
    // 计算行号
    const textBeforeSelection = text.substring(0, selectionStart);
    const lineNumber = textBeforeSelection.split('\n').length;
    
    // 估算滚动位置
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 22;
    const visibleLines = textarea.clientHeight / lineHeight;
    const targetScroll = (lineNumber - visibleLines / 2) * lineHeight;
    
    textarea.scrollTop = Math.max(0, targetScroll);
  }
  
  goToNextMatch() {
    if (this.matches.length === 0) return;
    
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matches.length;
    this.highlightCurrentMatch(); // 导航时需要高亮和聚焦
    this.updateMatchInfo();
  }
  
  goToPrevMatch() {
    if (this.matches.length === 0) return;
    
    this.currentMatchIndex = (this.currentMatchIndex - 1 + this.matches.length) % this.matches.length;
    this.highlightCurrentMatch(); // 导航时需要高亮和聚焦
    this.updateMatchInfo();
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
      this.showToast(`已替换 ${matchCount} 处`);
    } catch (e) {
      console.error('替换失败:', e);
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
    
    // 如果有选中文本，用作搜索词
    const selectedText = this.textarea.value.substring(
      this.textarea.selectionStart,
      this.textarea.selectionEnd
    );
    
    if (selectedText && selectedText.length < 100) {
      this.searchInput.value = selectedText;
      // 打开时不自动聚焦到匹配项，保持搜索框焦点
      this.performSearch(false);
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
    this.textarea.focus();
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
