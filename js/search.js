(function () {
    'use strict';

    const _el  = document.currentScript;
    const SITE = _el ? _el.src.replace(/\/js\/search\.js[\s\S]*$/, '') : '';

    let _index   = null;
    let _loading = false;

    async function loadIndex() {
        if (_index)   return _index;
        if (_loading) return null;
        _loading = true;
        try {
            const r = await fetch(SITE + '/search-index.json?_=' + Date.now());
            _index  = await r.json();
        } catch (e) { _index = []; }
        return _index;
    }

    function norm(s) { return s.toLowerCase().replace(/\s+/g, ''); }

    function doSearch(q) {
        if (!_index || !q.trim()) return [];
        const nq = norm(q);
        return _index
            .map(item => {
                const nt = norm(item.title);
                const nd = norm(item.desc);
                const nx = norm(item.text);
                const ng = norm((item.tags || []).join(''));
                let score = 0;
                if (nt.includes(nq))      score += 20;
                else if (ng.includes(nq)) score += 10;
                else if (nd.includes(nq)) score += 5;
                else if (nx.includes(nq)) score += 2;
                else return null;
                return { item, score };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
            .slice(0, 7)
            .map(r => r.item);
    }

    function initBar(wrap) {
        const input = wrap.querySelector('input');
        const btn   = wrap.querySelector('button');
        if (!input) return;

        // dropdown container
        const dd = document.createElement('div');
        dd.className = 'search-dropdown';
        wrap.appendChild(dd);

        let _timer = null;

        function close() { dd.classList.remove('search-open'); }
        function navigate(url) { location.href = SITE + '/' + url; }

        function renderResults(results, q) {
            dd.innerHTML = '';
            if (!results.length) {
                const empty = document.createElement('div');
                empty.className = 'search-empty';
                empty.textContent = '검색 결과 없음';
                dd.appendChild(empty);
            } else {
                results.forEach(item => {
                    const a = document.createElement('a');
                    a.className   = 'search-item';
                    a.href        = SITE + '/' + item.url;
                    a.innerHTML   =
                        `<span class="si-cat">${item.category}</span>` +
                        `<span class="si-title">${item.title}</span>` +
                        `<span class="si-desc">${item.desc}</span>`;
                    dd.appendChild(a);
                });
            }
            dd.classList.add('search-open');
        }

        input.addEventListener('focus', () => { loadIndex(); });

        input.addEventListener('input', () => {
            clearTimeout(_timer);
            const q = input.value;
            if (!q.trim()) { close(); return; }
            _timer = setTimeout(async () => {
                await loadIndex();
                renderResults(doSearch(q), q);
            }, 120);
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                const first = dd.querySelector('a.search-item');
                if (first) navigate(first.href.replace(SITE + '/', ''));
            }
            if (e.key === 'Escape') { close(); input.blur(); }
        });

        btn.addEventListener('click', () => {
            const first = dd.querySelector('a.search-item');
            if (first) navigate(first.href.replace(SITE + '/', ''));
            else if (input.value.trim()) {
                loadIndex().then(() => {
                    const r = doSearch(input.value);
                    renderResults(r, input.value);
                });
            }
        });

        document.addEventListener('click', e => {
            if (!wrap.contains(e.target)) close();
        });
    }

    function init() {
        document.querySelectorAll('.nav-search').forEach(initBar);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
