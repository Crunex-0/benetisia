/* ============================================================
   BENETISIA BGM Player
   - Persists state across page navigation via localStorage
   - Auto-advances to next track on end
   - Mini player injected into .main-nav (right side)
   - Full popup opened by clicking track name
   ============================================================ */
(function () {
    'use strict';

    // ── Base URL (works regardless of page directory depth) ──────
    const _el   = document.currentScript;
    const SITE  = _el ? _el.src.replace(/\/js\/player\.js[\s\S]*$/, '') : location.origin;
    const TRACKS_URL = SITE + '/bgm/tracks.json';
    const BGM_BASE   = SITE + '/bgm/';

    // ── State persisted in localStorage ─────────────────────────
    const LS_KEY = 'bnt_bgm_v1';
    let S = { idx: 0, playing: false, muted: false, vol: 0.7, repeat: 'all', time: 0 };

    function readLS() {
        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            Object.assign(S, saved);
        } catch (e) {}
        // Clamp volume
        S.vol = Math.max(0, Math.min(1, S.vol || 0.7));
    }

    let _lsTimer = null;
    function writeLS() {
        clearTimeout(_lsTimer);
        _lsTimer = setTimeout(() => {
            try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
        }, 250);
    }

    function flushLS() {
        clearTimeout(_lsTimer);
        S.time = au.currentTime;
        try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
    }

    // 페이지 이동 직전 재생 위치 즉시 저장
    window.addEventListener('beforeunload', flushLS);

    // ── Audio engine ─────────────────────────────────────────────
    const au = new Audio();
    let tracks = [];

    au.addEventListener('ended',          onEnded);
    au.addEventListener('timeupdate',     onTimeUpdate);
    au.addEventListener('loadedmetadata', () => renderProgress());
    au.addEventListener('error',          () => {
        if (tracks.length > 1) goTo(S.idx + 1, S.playing);
    });

    function onEnded() {
        if (S.repeat === 'one') {
            au.currentTime = 0;
            au.play().catch(() => {});
        } else if (S.repeat === 'all') {
            goTo(S.idx + 1, true);
        } else {
            if (S.idx < tracks.length - 1) goTo(S.idx + 1, true);
            else { S.playing = false; writeLS(); renderMini(); renderPopupCtrl(); }
        }
    }

    function onTimeUpdate() {
        S.time = au.currentTime;
        writeLS();
        renderProgress();
    }

    // Go to track index and optionally play
    function goTo(i, play) {
        if (!tracks.length) return;
        S.idx  = ((i % tracks.length) + tracks.length) % tracks.length;
        S.time = 0;
        au.src = BGM_BASE + tracks[S.idx];
        au.load();
        au.addEventListener('canplay', function onCanPlay() {
            au.removeEventListener('canplay', onCanPlay);
            if (play) { au.play().catch(() => {}); S.playing = true; }
        }, { once: true });
        writeLS();
        renderMini();
        renderPopupNow();
        renderPopupList();
        renderPopupCtrl();
    }

    function togglePlay() {
        if (!tracks.length) return;
        if (!au.src || au.src === location.href) { goTo(S.idx, true); return; }
        if (S.playing) { au.pause(); S.playing = false; }
        else           { au.play().catch(() => {}); S.playing = true; }
        writeLS();
        renderMini();
        renderPopupCtrl();
    }

    function setVol(v) {
        S.vol = Math.max(0, Math.min(1, v));
        if (!S.muted) au.volume = S.vol;
        writeLS();
    }

    function toggleMute() {
        S.muted   = !S.muted;
        au.volume = S.muted ? 0 : S.vol;
        writeLS();
        renderMini();
        renderPopupCtrl();
    }

    function cycleRepeat() {
        const modes = ['none', 'all', 'one'];
        S.repeat = modes[(modes.indexOf(S.repeat) + 1) % modes.length];
        writeLS();
        renderPopupCtrl();
    }

    function fmt(s) {
        if (!s || isNaN(s) || !isFinite(s)) return '0:00';
        const m = Math.floor(s / 60), sec = Math.floor(s % 60);
        return `${m}:${String(sec).padStart(2, '0')}`;
    }

    function dname(f) { return f.replace(/\.mp3$/i, ''); }

    // ── Mini player (injected into .main-nav) ────────────────────
    let $mini = null;

    function buildMini() {
        $mini = document.createElement('div');
        $mini.className = 'bgm-mini';
        $mini.innerHTML =
            `<button class="bgm-m-btn bgm-m-play" title="재생/일시정지">▶</button>` +
            `<button class="bgm-m-name" title="재생목록 열기">불러오는 중…</button>` +
            `<button class="bgm-m-btn bgm-m-mute" title="음소거">🔊</button>` +
            `<div class="bgm-m-vol-wrap"><input class="bgm-m-vol" type="range" min="0" max="100" step="1" title="볼륨"></div>`;

        $mini.querySelector('.bgm-m-play').addEventListener('click', togglePlay);
        $mini.querySelector('.bgm-m-name').addEventListener('click', openPopup);
        $mini.querySelector('.bgm-m-mute').addEventListener('click', toggleMute);
        $mini.querySelector('.bgm-m-vol').addEventListener('input', function () {
            const v = +this.value / 100;
            setVol(v);
            if (S.muted && v > 0) { S.muted = false; au.volume = v; }
            renderMini();
            renderPopupCtrl();
        });

        const nav = document.querySelector('.main-nav');
        if (nav) nav.appendChild($mini);
    }

    function renderMini() {
        if (!$mini || !tracks.length) return;
        $mini.querySelector('.bgm-m-play').textContent = S.playing ? '⏸' : '▶';
        $mini.querySelector('.bgm-m-name').textContent = dname(tracks[S.idx]);
        $mini.querySelector('.bgm-m-mute').textContent = S.muted ? '🔇' : '🔊';
        $mini.querySelector('.bgm-m-vol').value        = Math.round(S.vol * 100);
    }

    // ── Popup ────────────────────────────────────────────────────
    let $overlay = null, $popup = null;

    function buildPopup() {
        $overlay = document.createElement('div');
        $overlay.className = 'bgm-overlay';
        $overlay.addEventListener('click', e => { if (e.target === $overlay) closePopup(); });

        $popup = document.createElement('div');
        $popup.className = 'bgm-popup';
        $popup.innerHTML = `
<div class="bgm-pp-header">
    <div class="bgm-pp-logo">
        <svg width="14" height="14" viewBox="0 0 40 40" fill="none">
            <polygon points="20,2 38,20 20,38 2,20" stroke="#c8a84c" stroke-width="1.8" fill="none"/>
            <polygon points="20,9 31,20 20,31 9,20" stroke="#c8a84c" stroke-width="1" fill="rgba(200,168,76,0.1)"/>
            <circle cx="20" cy="20" r="2.5" fill="#c8a84c"/>
        </svg>
        BENETISIA
    </div>
    <span class="bgm-pp-subtitle">음악 플레이어</span>
    <button class="bgm-pp-close" title="닫기">×</button>
</div>

<div class="bgm-pp-now">
    <div class="bgm-pp-nowname">—</div>
    <div class="bgm-pp-progwrap">
        <div class="bgm-pp-progbar">
            <div class="bgm-pp-progfill"></div>
        </div>
        <div class="bgm-pp-times">
            <span class="bgm-pp-cur">0:00</span>
            <span class="bgm-pp-dur">0:00</span>
        </div>
    </div>
</div>

<div class="bgm-pp-ctrl">
    <button class="bgm-pp-btn bgm-pp-prev" title="이전 트랙">⏮</button>
    <button class="bgm-pp-btn bgm-pp-playbig" title="재생 / 일시정지">▶</button>
    <button class="bgm-pp-btn bgm-pp-next" title="다음 트랙">⏭</button>
    <button class="bgm-pp-btn bgm-pp-rep"  title="반복 모드">🔁</button>
</div>

<div class="bgm-pp-volrow">
    <button class="bgm-pp-btn bgm-pp-mute" title="음소거">🔊</button>
    <input  class="bgm-pp-vol" type="range" min="0" max="100" step="1">
    <span   class="bgm-pp-vollbl">70%</span>
</div>

<div class="bgm-pp-listarea">
    <div class="bgm-pp-listhd">
        <span>재생 목록</span>
        <span class="bgm-pp-listcount"></span>
    </div>
    <ul class="bgm-pp-list"></ul>
</div>`;

        // Wire up controls
        $popup.querySelector('.bgm-pp-close').addEventListener('click', closePopup);
        $popup.querySelector('.bgm-pp-prev').addEventListener('click', () => goTo(S.idx - 1, S.playing));
        $popup.querySelector('.bgm-pp-playbig').addEventListener('click', togglePlay);
        $popup.querySelector('.bgm-pp-next').addEventListener('click', () => goTo(S.idx + 1, S.playing));
        $popup.querySelector('.bgm-pp-rep').addEventListener('click', cycleRepeat);
        $popup.querySelector('.bgm-pp-mute').addEventListener('click', toggleMute);
        $popup.querySelector('.bgm-pp-vol').addEventListener('input', function () {
            const v = +this.value / 100;
            setVol(v);
            $popup.querySelector('.bgm-pp-vollbl').textContent = Math.round(v * 100) + '%';
            if ($mini) $mini.querySelector('.bgm-m-vol').value = Math.round(v * 100);
            if (S.muted && v > 0) { S.muted = false; au.volume = v; }
            renderMini();
            renderPopupCtrl();
        });

        // Progress bar seek on click
        $popup.querySelector('.bgm-pp-progbar').addEventListener('click', function (e) {
            if (!au.duration) return;
            const r = this.getBoundingClientRect();
            au.currentTime = ((e.clientX - r.left) / r.width) * au.duration;
        });

        $overlay.appendChild($popup);
        document.body.appendChild($overlay);
    }

    function renderPopupNow() {
        if (!$popup) return;
        $popup.querySelector('.bgm-pp-nowname').textContent = tracks.length ? dname(tracks[S.idx]) : '—';
    }

    function renderPopupCtrl() {
        if (!$popup) return;
        $popup.querySelector('.bgm-pp-playbig').textContent = S.playing ? '⏸' : '▶';
        $popup.querySelector('.bgm-pp-mute').textContent    = S.muted ? '🔇' : '🔊';
        $popup.querySelector('.bgm-pp-vol').value           = Math.round(S.vol * 100);
        $popup.querySelector('.bgm-pp-vollbl').textContent  = Math.round(S.vol * 100) + '%';

        const rmap = { none: ['➡', '반복 없음'], all: ['🔁', '전체 반복'], one: ['🔂', '한 곡 반복'] };
        const [icon, label] = rmap[S.repeat] || rmap.all;
        const rb = $popup.querySelector('.bgm-pp-rep');
        rb.textContent = icon; rb.title = label;
        rb.classList.toggle('bgm-rep-active', S.repeat !== 'none');
    }

    function renderPopupList() {
        if (!$popup) return;
        const ul  = $popup.querySelector('.bgm-pp-list');
        const cnt = $popup.querySelector('.bgm-pp-listcount');
        ul.innerHTML = '';
        if (cnt) cnt.textContent = tracks.length + '곡';
        tracks.forEach((t, i) => {
            const li = document.createElement('li');
            li.className = 'bgm-pp-li' + (i === S.idx ? ' bgm-pp-li-on' : '');
            li.innerHTML =
                `<span class="bgm-pp-li-num">${String(i + 1).padStart(2, '0')}</span>` +
                `<span class="bgm-pp-li-title">${dname(t)}</span>` +
                `<span class="bgm-pp-li-ico">${i === S.idx ? '▶' : ''}</span>`;
            li.addEventListener('click', () => { goTo(i, true); });
            ul.appendChild(li);
        });
    }

    function renderProgress() {
        if (!$popup) return;
        const pct  = au.duration ? (au.currentTime / au.duration) * 100 : 0;
        const fill = $popup.querySelector('.bgm-pp-progfill');
        const cur  = $popup.querySelector('.bgm-pp-cur');
        const dur  = $popup.querySelector('.bgm-pp-dur');
        if (fill) fill.style.width = pct + '%';
        if (cur)  cur.textContent  = fmt(au.currentTime);
        if (dur)  dur.textContent  = fmt(au.duration);
    }

    function openPopup() {
        if (!$overlay) buildPopup();
        renderPopupNow();
        renderPopupCtrl();
        renderPopupList();
        renderProgress();
        $overlay.classList.add('bgm-open');
        document.body.classList.add('bgm-lock');
    }

    function closePopup() {
        if ($overlay) $overlay.classList.remove('bgm-open');
        document.body.classList.remove('bgm-lock');
    }

    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });

    // ── Init ─────────────────────────────────────────────────────
    async function init() {
        readLS();
        buildMini();

        try {
            const res = await fetch(TRACKS_URL + '?_=' + Date.now());
            if (!res.ok) throw new Error('fetch failed');
            tracks = await res.json();
        } catch (e) {
            tracks = [];
        }

        if (!tracks.length) {
            if ($mini) $mini.querySelector('.bgm-m-name').textContent = '트랙 없음';
            return;
        }

        if (S.idx >= tracks.length) S.idx = 0;
        au.src    = BGM_BASE + tracks[S.idx];
        au.volume = S.muted ? 0 : S.vol;
        au.load();

        au.addEventListener('canplay', function onReady() {
            au.removeEventListener('canplay', onReady);
            if (S.time > 1 && isFinite(au.duration) && S.time < au.duration) {
                au.currentTime = S.time;
            }
            if (S.playing) {
                au.play().catch(() => { S.playing = false; writeLS(); });
            }
            renderMini();
        }, { once: true });

        renderMini();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
