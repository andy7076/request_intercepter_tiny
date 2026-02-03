/**
 * Editor Search & Replace Logic
 * Encapsulates search functionality for CodeMirror editors
 */
class EditorSearch {
  constructor(cm, wrapper) {
    this.cm = cm;
    this.wrapper = wrapper;
    this.panel = null;
    this.state = {
      query: '',
      replace: '',
      matches: [],
      currentIdx: -1,
      caseSensitive: false,
      isRegex: false
    };
    
    // Bind methods
    this.findNext = this.findNext.bind(this);
    this.findPrev = this.findPrev.bind(this);
    this.replace = this.replace.bind(this);
    this.replaceAll = this.replaceAll.bind(this);
    this.close = this.close.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.togglePanel = this.togglePanel.bind(this);
    
    this.init();
  }

  togglePanel() {
    if (this.panel.classList.contains('hidden')) {
      this.open();
    } else {
      this.close();
    }
  }

  close() {
    this.panel.classList.add('hidden');
    this.clearMarks();
    this.cm.focus();
  }

  init() {
    this.createPanel();
    
    // Add keymap for search (Cmd-F / Ctrl-F)
    const extraKeys = this.cm.getOption('extraKeys') || {};
    const isMac = /Mac/.test(navigator.platform);
    const searchKey = isMac ? 'Cmd-F' : 'Ctrl-F';
    const replaceKey = isMac ? 'Cmd-Alt-F' : 'Shift-Ctrl-F';
    
    extraKeys[searchKey] = () => {
      this.open();
      this.searchInput.focus();
      const selection = this.cm.getSelection();
      if (selection) {
        this.searchInput.value = selection;
        this.handleInput();
      }
    };
    
    
    extraKeys['Esc'] = () => {
      if (!this.panel.classList.contains('hidden')) {
        this.close();
        this.cm.focus();
      }
    };
    
    this.cm.setOption('extraKeys', extraKeys);

    // Re-search on content change if search is active
    this.cm.on('change', (cm, change) => {
      if (this.state.query && !this.panel.classList.contains('hidden')) {
        // Debounce could be added here for performance, but for now direct call
        // Avoid infinite loop if change is from replacement? 
        // Replacement comes from this.replace which calls search() anyway.
        // We only care about external changes (typing).
        if (change.origin !== '+move' && change.origin !== 'setValue') {
             // Simplistic approach: just re-search to update positions
             this.search();
        }
      }
    });

    // Listen for language changes
    window.addEventListener('languageChanged', () => {
      this.updateUIText();
    });
  }
  
  updateUIText() {
    if (!this.panel) return;
    
    // Update placeholders
    const searchInput = this.panel.querySelector('.cm-find-input');
    if (searchInput) searchInput.placeholder = window.i18n.t('searchPlaceholder');
    
    const replaceInput = this.panel.querySelector('.cm-replace-input');
    if (replaceInput) replaceInput.placeholder = window.i18n.t('replacePlaceholder');
    
    // Update titles (tooltips)
    const prevBtn = this.panel.querySelector('.prev-btn');
    if (prevBtn) prevBtn.title = window.i18n.t('prevMatch');
    
    const nextBtn = this.panel.querySelector('.next-btn');
    if (nextBtn) nextBtn.title = window.i18n.t('nextMatch');
    
    const closeBtn = this.panel.querySelector('.close-btn');
    if (closeBtn) closeBtn.title = window.i18n.t('closeEsc');
    
    // Update button text
    const replaceBtn = this.panel.querySelector('.replace-btn');
    if (replaceBtn) replaceBtn.textContent = window.i18n.t('replace');
    
    const replaceAllBtn = this.panel.querySelector('.replace-all-btn');
    if (replaceAllBtn) replaceAllBtn.textContent = window.i18n.t('replaceAllShort');
  }

  createPanel() {
    this.panel = document.createElement('div');
    this.panel.className = 'cm-search-panel hidden';
    
    const ui = `
      <div class="cm-search-group">
        <div class="cm-search-field">
          <input type="text" class="cm-search-input cm-find-input" placeholder="${window.i18n.t('searchPlaceholder')}" />
          <span class="cm-search-count"></span>
        </div>
        <div class="cm-search-btns">
          <button type="button" class="cm-btn prev-btn" title="${window.i18n.t('prevMatch')}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
          </button>
          <button type="button" class="cm-btn next-btn" title="${window.i18n.t('nextMatch')}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>
      </div>
      <div class="cm-search-group">
        <input type="text" class="cm-replace-input cm-search-input" placeholder="${window.i18n.t('replacePlaceholder')}" />
        <div class="cm-search-btns">
          <button type="button" class="cm-btn replace-btn">${window.i18n.t('replace')}</button>
          <button type="button" class="cm-btn replace-all-btn">${window.i18n.t('replaceAllShort')}</button>
        </div>
      </div>
      <button type="button" class="cm-btn close-btn" title="${window.i18n.t('closeEsc')}">×</button>
    `;
    
    this.panel.innerHTML = ui;
    this.wrapper.insertBefore(this.panel, this.wrapper.firstChild);
    
    // Elements reference
    this.searchInput = this.panel.querySelector('.cm-find-input');
    this.replaceInput = this.panel.querySelector('.cm-replace-input');
    this.countSpan = this.panel.querySelector('.cm-search-count');
    
    // Events
    this.searchInput.addEventListener('input', (e) => this.handleInput(e.target.value));
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) this.findPrev();
        else this.findNext();
        e.preventDefault();
      }
    });
    
    this.replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.replace();
        e.preventDefault();
      }
    });
    
    this.panel.querySelector('.prev-btn').addEventListener('click', this.findPrev);
    this.panel.querySelector('.next-btn').addEventListener('click', this.findNext);
    this.panel.querySelector('.replace-btn').addEventListener('click', this.replace);
    this.panel.querySelector('.replace-all-btn').addEventListener('click', this.replaceAll);
    this.panel.querySelector('.close-btn').addEventListener('click', this.close);
  }
  
  reset() {
    this.close();
    this.state = {
      query: '',
      replace: '',
      matches: [],
      currentIdx: -1,
      caseSensitive: false,
      isRegex: false
    };
    if (this.searchInput) this.searchInput.value = '';
    if (this.replaceInput) this.replaceInput.value = '';
    if (this.countSpan) this.countSpan.textContent = '';
  }

  open() {
    this.panel.classList.remove('hidden');
    this.searchInput.focus();
    // When opening with existing content
    if (this.searchInput.value) {
        // If query hasn't changed, preserve the index state and don't jump
        const sameQuery = (this.searchInput.value === this.state.query);
        // jump = !sameQuery (jump only if new query)
        // preserve = sameQuery (preserve if same query)
        
        // Ensure state.query is set before calling search via handleInput logic, 
        // actually handleInput sets it.
        this.handleInput(this.searchInput.value, !sameQuery, sameQuery);
    }
  }

  handleInput(val = this.searchInput.value, jump = true, preserve = false) {
    this.state.query = val;
    this.search(jump, preserve);
  }

  search(jumpToFirst = true, preserveIndex = false) {
    // Save previous index before clearing
    const prevIdx = this.state.currentIdx;

    this.clearMarks();
    this.state.matches = [];
    this.state.currentIdx = -1;
    this.countSpan.textContent = '';
    
    const query = this.state.query;
    if (!query) return;

    const doc = this.cm.getDoc();
    const value = doc.getValue();
    const queryLen = query.length;
    
    let index = 0;
    while (true) {
      if (this.state.caseSensitive) {
        index = value.indexOf(query, index);
      } else {
        index = value.toLowerCase().indexOf(query.toLowerCase(), index);
      }
      
      if (index === -1) break;
      
      const from = this.cm.posFromIndex(index);
      const to = this.cm.posFromIndex(index + queryLen);
      
      this.state.matches.push({ from, to });
      
      // Highlight: Use Overlay is better for performance, but markText is easier for now
      this.cm.markText(from, to, { className: 'cm-match-highlight' });
      
      index += queryLen;
    }

    if (this.state.matches.length > 0) {
      if (jumpToFirst) {
        // User is typing, force jump to first as requested
        this.state.currentIdx = 0;
        this.highlightCurrent();
      } else if (preserveIndex && prevIdx !== -1 && prevIdx < this.state.matches.length) {
        // Preserve previous index state, do not jump, do not change cursor/scroll
        this.state.currentIdx = prevIdx;
        this.highlightCurrent(false);
      } else {
        // Just opening or passive update, find closest to keep context
        const cursor = doc.getCursor();
        let nextIdx = this.state.matches.findIndex(m => 
          (m.from.line > cursor.line) || (m.from.line === cursor.line && m.from.ch >= cursor.ch)
        );
        if (nextIdx === -1) nextIdx = 0; // Wrap around
        this.state.currentIdx = nextIdx;
        this.highlightCurrent(false);
      }
      this.updateCount();
    } else {
      this.countSpan.textContent = '0/0';
    }
  }
  
  highlightCurrent(scroll = true) {
    if (this.state.currentIdx === -1 || !this.state.matches[this.state.currentIdx]) return;
    
    const match = this.state.matches[this.state.currentIdx];
    
    // Clear previous active mark
    if (this.currentMatchMark) {
      this.currentMatchMark.clear();
      this.currentMatchMark = null;
    }
    
    // Create new active mark
    this.currentMatchMark = this.cm.markText(match.from, match.to, { className: 'cm-match-highlight-active' });
    
    // Remove previous active highlights if any (controlled by CSS usually, but here we can force it)
    // Actually, let's just selection
    this.cm.setSelection(match.from, match.to, { scroll: scroll });
    
    // Use a larger margin (100px) to try to center the match or at least keep it away from edges
    // Pass {from, to} to ensures the entire match is visible if possible
    if (scroll) {
      this.cm.scrollIntoView({from: match.from, to: match.to}, 100);
    }
  }

  updateCount() {
    const total = this.state.matches.length;
    const current = this.state.currentIdx + 1;
    this.countSpan.textContent = `${current}/${total}`;
  }

  clearMarks() {
    this.cm.getAllMarks().forEach(m => {
      if (m.className === 'cm-match-highlight' || m.className === 'cm-match-highlight-active') m.clear();
    });
    this.currentMatchMark = null;
  }

  findNext() {
    if (this.state.matches.length === 0) return;
    this.state.currentIdx = (this.state.currentIdx + 1) % this.state.matches.length;
    this.highlightCurrent();
    this.updateCount();
  }

  findPrev() {
    if (this.state.matches.length === 0) return;
    this.state.currentIdx = (this.state.currentIdx - 1 + this.state.matches.length) % this.state.matches.length;
    this.highlightCurrent();
    this.updateCount();
  }

  replace() {
    if (this.state.matches.length === 0) return;
    
    const match = this.state.matches[this.state.currentIdx];
    const replacement = this.replaceInput.value;
    
    // Replace in editor
    this.cm.replaceRange(replacement, match.from, match.to);
    
    // Update search (brute force re-search is safer to keep indices correct)
    this.search(); 
  }

  replaceAll() {
    const query = this.state.query;
    if (!query) return;
    
    const replacement = this.replaceInput.value;
    const value = this.cm.getValue();
    
    let newValue;
    if (this.state.caseSensitive) {
      newValue = value.split(query).join(replacement);
    } else {
      // Regex for case insensitive replace all
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      newValue = value.replace(regex, replacement);
    }
    
    this.cm.setValue(newValue);
    this.search(); // Reset
  }
}

// Make it globally available or export if module
window.EditorSearch = EditorSearch;
