/* ══════════════════════════════════════════════════════════════════
   VIRTUS ABOGAD@S · app.js
   Vanilla JS, sin dependencias salvo Lenis (scroll suave, opcional:
   si no carga, la página usa el scroll nativo).

   Arquitectura:
   · Un solo motor de scroll (S) con módulos {measure, read, write}.
     - measure: lee la geometría (al cargar / redimensionar)
     - read:    lecturas por frame (solo donde son imprescindibles)
     - write:   escribe variables CSS (--e, --tp, --hp...) por frame
   · Las animaciones viven en CSS; JS solo publica el progreso.
   ══════════════════════════════════════════════════════════════════ */
(() => {
    'use strict';

    /* ───────────── utilidades ───────────── */
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const range = (v, a, b) => clamp((v - a) / (b - a));
    const ease = {
        out: t => 1 - Math.pow(1 - t, 3),
        io: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
        expo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
    };
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    const root = document.documentElement;
    const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
    const fineMQ = matchMedia('(hover: hover) and (pointer: fine)');
    const PIN_MQ = matchMedia('(min-width: 960px) and (prefers-reduced-motion: no-preference)');
    const WA_NUMBER = '525540090059';

    /* Estado compartido del scroll */
    const S = { y: window.scrollY, vel: 0, vh: window.innerHeight, vw: window.innerWidth, docH: 0, lenis: null };
    const mods = [];
    let queued = false;

    const request = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
    function frame() {
        queued = false;
        for (const m of mods) if (m.read) m.read(S);
        for (const m of mods) if (m.write) m.write(S);
    }
    function measureAll() {
        S.vh = window.innerHeight;
        S.vw = window.innerWidth;
        S.y = window.scrollY;
        S.docH = root.scrollHeight;
        for (const m of mods) if (m.measure) m.measure(S);
        request();
    }
    const absTop = el => el.getBoundingClientRect().top + window.scrollY;

    /* ───────────── WhatsApp: enlaces con mensaje ───────────── */
    function setupWhatsApp() {
        $$('[data-wa]').forEach(a => {
            a.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(a.dataset.wa)}`;
            a.target = '_blank';
            a.rel = 'noopener';
        });
    }

    /* ───────────── Titulares: entrada palabra por palabra ───────────── */
    function splitHeadings() {
        $$('[data-split]').forEach(el => {
            el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
            if (el.dataset.splitBase) el.style.setProperty('--base', el.dataset.splitBase);
            let i = 0;
            const walk = node => {
                Array.from(node.childNodes).forEach(child => {
                    if (child.nodeType === 3) {
                        const frag = document.createDocumentFragment();
                        child.textContent.split(/(\s+)/).forEach(part => {
                            if (!part) return;
                            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
                            const w = document.createElement('span');
                            w.className = 'w';
                            w.setAttribute('aria-hidden', 'true');
                            const inner = document.createElement('span');
                            inner.style.setProperty('--i', i++);
                            inner.textContent = part;
                            w.appendChild(inner);
                            frag.appendChild(w);
                        });
                        child.replaceWith(frag);
                    } else if (child.nodeType === 1 && child.tagName !== 'BR') {
                        walk(child);
                    }
                });
            };
            walk(el);
        });
    }

    /* ───────────── Loader ───────────── */
    let loaderDone = false;
    function initLoader() {
        const el = $('#loader');
        const num = $('#ld-num');
        const fill = $('.ld__fill');
        if (!el) { finishLoader(); return; }

        const t0 = performance.now();
        const MIN = reduceMQ.matches ? 500 : 2300;
        let shown = 0;
        let ready = false;

        const loaded = document.readyState === 'complete'
            ? Promise.resolve()
            : new Promise(r => window.addEventListener('load', r, { once: true }));
        Promise.all([loaded, document.fonts ? document.fonts.ready : Promise.resolve()]).then(() => { ready = true; });

        const tick = now => {
            if (loaderDone) return;
            const elapsed = now - t0;
            const sim = ease.out(clamp(elapsed / MIN)) * 90;
            const target = ready && elapsed >= MIN ? 100 : sim;
            shown = lerp(shown, target, .09);
            if (target === 100 && shown > 99.3) shown = 100;
            num.textContent = Math.round(shown);
            fill.style.strokeDashoffset = (100 - shown).toFixed(2);
            if (shown >= 100) { finishLoader(); return; }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(finishLoader, 8000); // seguro anti-bloqueo
    }

    function finishLoader() {
        if (loaderDone) return;
        loaderDone = true;
        const el = $('#loader');
        if (el) el.classList.add('is-done');
        root.classList.remove('is-loading');
        if (S.lenis) S.lenis.start();
        setTimeout(() => {
            root.classList.add('is-ready');
            const h1 = $('.hero__title');
            if (h1) h1.classList.add('is-in');
            startWaTip();
        }, el ? 500 : 0);
        if (el) setTimeout(() => el.remove(), 1900);
    }

    /* ───────────── Scroll suave (Lenis) ───────────── */
    function initScroll() {
        if (window.Lenis && !reduceMQ.matches) {
            const lenis = new Lenis({ lerp: .085, wheelMultiplier: .95, smoothWheel: true });
            S.lenis = lenis;
            if (!loaderDone) lenis.stop();
            lenis.on('scroll', e => { S.y = e.scroll; S.vel = e.velocity || 0; request(); });
            const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
            requestAnimationFrame(raf);
        } else {
            let last = S.y;
            window.addEventListener('scroll', () => {
                S.y = window.scrollY;
                S.vel = S.y - last;
                last = S.y;
                request();
            }, { passive: true });
        }
    }

    function scrollToY(y, duration = 1.7) {
        if (S.lenis) S.lenis.scrollTo(y, { duration });
        else window.scrollTo({ top: y, behavior: reduceMQ.matches ? 'auto' : 'smooth' });
    }

    function lockScroll(lock) {
        if (S.lenis) { lock ? S.lenis.stop() : S.lenis.start(); }
        else document.body.style.overflow = lock ? 'hidden' : '';
    }

    /* ───────────── Menú móvil ───────────── */
    const menu = $('#menu');
    const burger = $('#burger');
    function setMenu(open) {
        if (!menu || !burger) return;
        menu.classList.toggle('is-open', open);
        menu.setAttribute('aria-hidden', String(!open));
        menu.inert = !open;
        root.classList.toggle('menu-open', open);
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
        lockScroll(open);
    }
    const closeMenu = () => { if (menu && menu.classList.contains('is-open')) setMenu(false); };
    function initMenu() {
        if (!burger) return;
        burger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
        document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); burger.focus(); } });
        window.addEventListener('resize', debounce(() => { if (innerWidth >= 1024) closeMenu(); }, 150));
    }

    /* ───────────── Anclas y saltos a servicios ───────────── */
    function goToService(i) {
        if (PIN_MQ.matches) {
            const dist = svc.h - svc.stageH;
            scrollToY(svc.top + (.15 + (i + .5) * (.85 / 4)) * dist, 2.2);
        } else {
            const first = svc.items[0];
            const y = absTop(svc.stage) + i * (first.offsetHeight + 22) - (S.vh * .08 + i * 6);
            scrollToY(Math.max(0, y), 1.8);
        }
    }
    function initAnchors() {
        document.addEventListener('click', e => {
            const go = e.target.closest('[data-go]');
            if (go) { e.preventDefault(); closeMenu(); goToService(parseInt(go.dataset.go, 10)); return; }
            const a = e.target.closest('a[href^="#"]');
            if (!a) return;
            const id = a.getAttribute('href');
            if (id.length < 2) return;
            e.preventDefault();
            closeMenu();
            const target = id === '#inicio' ? null : $(id);
            scrollToY(target ? absTop(target) : 0, 1.7);
            history.replaceState(null, '', id);
        });
    }

    /* ───────────── Revelado al hacer scroll ───────────── */
    function initReveal() {
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (!en.isIntersecting) return;
                const el = en.target;
                el.classList.add('is-in');
                io.unobserve(el);
                if (el.hasAttribute('data-reveal')) {
                    // Al terminar la entrada se libera el elemento para que sus hover/transiciones propias funcionen
                    const d = parseFloat(el.style.getPropertyValue('--d')) || 0;
                    setTimeout(() => el.removeAttribute('data-reveal'), (d + 1.7) * 1000);
                }
            });
        }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
        $$('[data-reveal], [data-split]').forEach(el => { if (!el.classList.contains('hero__title')) io.observe(el); });
    }

    /* ───────────── Contadores ───────────── */
    function initCounters() {
        const els = $$('.count[data-count]');
        if (!els.length) return;
        els.forEach(el => { if (!reduceMQ.matches) el.textContent = '0'; });
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (!en.isIntersecting) return;
                io.unobserve(en.target);
                const el = en.target;
                const to = parseFloat(el.dataset.count);
                if (reduceMQ.matches) { el.textContent = to; return; }
                const t0 = performance.now();
                const run = now => {
                    const p = clamp((now - t0) / 1800);
                    el.textContent = Math.round(to * ease.expo(p));
                    if (p < 1) requestAnimationFrame(run);
                };
                requestAnimationFrame(run);
            });
        }, { threshold: .6 });
        els.forEach(el => io.observe(el));
    }

    /* ───────────── Bento: foco de luz que sigue al cursor ───────────── */
    function initBento() {
        if (!fineMQ.matches) return;
        $$('.bento__cell').forEach(cell => {
            cell.addEventListener('pointermove', e => {
                const r = cell.getBoundingClientRect();
                cell.style.setProperty('--mx', `${e.clientX - r.left}px`);
                cell.style.setProperty('--my', `${e.clientY - r.top}px`);
            });
        });
    }

    /* ───────────── Botones magnéticos ───────────── */
    function initMagnetic() {
        const els = $$('[data-magnetic]');
        if (!els.length || !fineMQ.matches || reduceMQ.matches) return;
        let pending = false, px = 0, py = 0;
        const update = () => {
            pending = false;
            els.forEach(el => {
                const r = el.getBoundingClientRect();
                const dx = px - (r.left + r.width / 2);
                const dy = py - (r.top + r.height / 2);
                const near = Math.hypot(dx, dy) < Math.max(r.width, r.height) * .75;
                el.style.translate = near ? `${(dx * .22).toFixed(1)}px ${(dy * .3).toFixed(1)}px` : '0 0';
            });
        };
        window.addEventListener('pointermove', e => {
            px = e.clientX; py = e.clientY;
            if (!pending) { pending = true; requestAnimationFrame(update); }
        }, { passive: true });
    }

    /* ───────────── Preguntas frecuentes ───────────── */
    function initFaq() {
        $$('.faq__q').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = btn.closest('.faq__item');
                const open = !item.classList.contains('is-open');
                $$('.faq__item.is-open').forEach(o => {
                    o.classList.remove('is-open');
                    $('.faq__q', o).setAttribute('aria-expanded', 'false');
                });
                item.classList.toggle('is-open', open);
                btn.setAttribute('aria-expanded', String(open));
            });
        });
    }

    /* ───────────── Formulario → WhatsApp ───────────── */
    function initForm() {
        const form = $('#wa-form');
        if (!form) return;
        const fields = {
            name: { el: $('#f-name'), err: $('#e-name'), msg: 'Escribe tu nombre para poder dirigirnos a ti.' },
            area: { el: $('#f-area'), err: $('#e-area'), msg: 'Elige el tema con el que necesitas ayuda.' },
            ok: { el: $('#f-ok'), err: $('#e-ok'), msg: 'Necesitamos tu autorización para contactarte.' }
        };
        const valid = k => {
            const f = fields[k];
            const good = k === 'ok' ? f.el.checked : k === 'name' ? f.el.value.trim().length > 1 : !!f.el.value;
            f.err.textContent = good ? '' : f.msg;
            f.el.closest('.field').classList.toggle('is-error', !good);
            f.el.setAttribute('aria-invalid', String(!good));
            return good;
        };
        Object.keys(fields).forEach(k => {
            const ev = k === 'name' ? 'input' : 'change';
            fields[k].el.addEventListener(ev, () => { if (fields[k].el.closest('.field').classList.contains('is-error')) valid(k); });
        });

        form.addEventListener('submit', e => {
            e.preventDefault();
            const results = Object.keys(fields).map(k => [k, valid(k)]);
            const firstBad = results.find(r => !r[1]);
            if (firstBad) { fields[firstBad[0]].el.focus(); return; }

            const name = fields.name.el.value.trim();
            const area = fields.area.el.value;
            const phone = $('#f-phone').value.trim();
            const extra = $('#f-msg').value.trim();
            let text = `Hola, soy ${name}. Necesito orientación sobre: ${area}.`;
            if (extra) text += ` ${extra}`;
            if (phone) text += ` Mi teléfono es ${phone}.`;
            text += ' Les escribo desde su sitio web.';
            const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

            const btn = $('#f-submit');
            const label = $('.btn__label', btn);
            const done = $('#form-done');
            btn.classList.add('is-loading');
            label.textContent = 'Abriendo WhatsApp…';
            setTimeout(() => {
                window.open(url, '_blank', 'noopener');
                btn.classList.remove('is-loading');
                label.textContent = 'Enviar mi caso por WhatsApp';
                $('#form-link').href = url;
                done.hidden = false;
            }, 700);
        });
    }

    /* ───────────── Botón flotante: burbuja de invitación ───────────── */
    function startWaTip() {
        const wa = $('#wa-float');
        if (!wa) return;
        setTimeout(() => wa.classList.add('show-tip'), 6500);
        setTimeout(() => wa.classList.remove('show-tip'), 12500);
    }

    /* ═════════════ Partículas de polvo dorado (canvas) ═════════════ */
    class Dust {
        constructor(canvas, opts) {
            this.c = canvas;
            this.ctx = canvas.getContext('2d');
            this.o = Object.assign({ rgb: [168, 96, 58], density: 15000, max: 90, link: true, alpha: .75, linkAlpha: .2 }, opts);
            this.parts = [];
            this.mouse = { x: -9999, y: -9999 };
            this.running = false;
            this.sprite = this.makeSprite();
            this.resize();
        }
        makeSprite() {
            const s = document.createElement('canvas');
            s.width = s.height = 64;
            const g = s.getContext('2d');
            const [r, gr, b] = this.o.rgb;
            const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
            grad.addColorStop(0, `rgba(${r},${gr},${b},1)`);
            grad.addColorStop(.25, `rgba(${r},${gr},${b},.5)`);
            grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
            g.fillStyle = grad;
            g.fillRect(0, 0, 64, 64);
            return s;
        }
        spawn(initial) {
            const z = .25 + Math.random() * .75;
            const big = Math.random() < .07;
            return {
                x: Math.random() * this.w,
                y: initial ? Math.random() * this.h : this.h + 30,
                z, big,
                r: big ? 9 + Math.random() * 14 : .7 + z * 2.1,
                vy: -(big ? 4 + Math.random() * 6 : 6 + z * 20),
                ph: Math.random() * 6.28,
                tw: .6 + Math.random() * 1.6
            };
        }
        resize() {
            const rect = this.c.getBoundingClientRect();
            this.w = Math.max(1, rect.width);
            this.h = Math.max(1, rect.height);
            this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
            this.c.width = Math.round(this.w * this.dpr);
            this.c.height = Math.round(this.h * this.dpr);
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            const n = clamp(Math.round(this.w * this.h / this.o.density), 26, this.o.max);
            while (this.parts.length < n) this.parts.push(this.spawn(true));
            this.parts.length = n;
            if (!this.running) this.draw(performance.now());
        }
        step(dt, t) {
            const R = 130, R2 = R * R;
            for (const p of this.parts) {
                p.y += p.vy * dt;
                p.x += Math.sin(t * .0004 * p.tw + p.ph) * 10 * dt * p.z;
                const dx = p.x - this.mouse.x, dy = p.y - this.mouse.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < R2) {
                    const d = Math.sqrt(d2) || 1;
                    const f = Math.pow(1 - d / R, 2) * 520 * dt * p.z;
                    p.x += dx / d * f;
                    p.y += dy / d * f;
                }
                if (p.y < -40) Object.assign(p, this.spawn(false));
                if (p.x < -40) p.x = this.w + 40;
                else if (p.x > this.w + 40) p.x = -40;
            }
        }
        draw(t) {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.w, this.h);
            const [r, g, b] = this.o.rgb;
            for (const p of this.parts) {
                const tw = .35 + .65 * (.5 + .5 * Math.sin(t * .001 * p.tw + p.ph));
                ctx.globalAlpha = (p.big ? .16 : this.o.alpha) * tw * (p.big ? 1 : p.z);
                const s = p.r * (p.big ? 2 : 7);
                ctx.drawImage(this.sprite, p.x - s / 2, p.y - s / 2, s, s);
            }
            ctx.globalAlpha = 1;
            if (this.o.link) {
                ctx.lineWidth = .7;
                const L = 105, L2 = L * L;
                const ps = this.parts;
                for (let i = 0; i < ps.length; i++) {
                    if (ps[i].big) continue;
                    for (let j = i + 1; j < ps.length; j++) {
                        if (ps[j].big) continue;
                        const dx = ps[i].x - ps[j].x, dy = ps[i].y - ps[j].y;
                        const d2 = dx * dx + dy * dy;
                        if (d2 < L2) {
                            ctx.strokeStyle = `rgba(${r},${g},${b},${((1 - Math.sqrt(d2) / L) * this.o.linkAlpha).toFixed(3)})`;
                            ctx.beginPath();
                            ctx.moveTo(ps[i].x, ps[i].y);
                            ctx.lineTo(ps[j].x, ps[j].y);
                            ctx.stroke();
                        }
                    }
                }
            }
        }
        start() {
            if (this.running || reduceMQ.matches) return;
            this.running = true;
            this.last = performance.now();
            const loop = now => {
                if (!this.running) return;
                const dt = Math.min(.05, (now - this.last) / 1000);
                this.last = now;
                this.step(dt, now);
                this.draw(now);
                this.raf = requestAnimationFrame(loop);
            };
            this.raf = requestAnimationFrame(loop);
        }
        stop() { this.running = false; cancelAnimationFrame(this.raf); }
        pointer(clientX, clientY) {
            const r = this.c.getBoundingClientRect();
            this.mouse.x = clientX - r.left;
            this.mouse.y = clientY - r.top;
        }
    }

    const dusts = [];
    function initDust() {
        const defs = [
            { id: 'hero-dust', opts: { rgb: [168, 96, 58], density: 14000, max: 95 } },
            { id: 'contact-dust', opts: { rgb: [221, 169, 130], density: 20000, max: 70, alpha: .85, linkAlpha: .16 } }
        ];
        defs.forEach(d => {
            const canvas = document.getElementById(d.id);
            if (!canvas || !canvas.getContext) return;
            const dust = new Dust(canvas, d.opts);
            dusts.push(dust);
            new IntersectionObserver(([en]) => { en.isIntersecting ? dust.start() : dust.stop(); }, { rootMargin: '80px' }).observe(canvas);
        });
        if (fineMQ.matches) {
            window.addEventListener('pointermove', e => dusts.forEach(d => d.pointer(e.clientX, e.clientY)), { passive: true });
        }
        document.addEventListener('visibilitychange', () => { if (document.hidden) dusts.forEach(d => d.stop()); });
        window.addEventListener('resize', debounce(() => dusts.forEach(d => d.resize()), 200));
    }

    /* ═════════════ Hero: paralaje con el puntero + medallón 3D ═════════════ */
    function initHeroPointer() {
        const hero = $('#inicio');
        const seal = $('#seal');
        if (!hero || !seal || !fineMQ.matches || reduceMQ.matches) return;
        let tx = 0, ty = 0, cx = 0, cy = 0, active = false, visible = true;
        const loop = () => {
            cx = lerp(cx, tx, .07);
            cy = lerp(cy, ty, .07);
            hero.style.setProperty('--px', cx.toFixed(3));
            hero.style.setProperty('--py', cy.toFixed(3));
            seal.style.setProperty('--ry', `${(cx * 11).toFixed(2)}deg`);
            seal.style.setProperty('--rx', `${(-cy * 9).toFixed(2)}deg`);
            if (Math.abs(cx - tx) + Math.abs(cy - ty) > .002) requestAnimationFrame(loop);
            else active = false;
        };
        hero.addEventListener('pointermove', e => {
            if (!visible) return;
            const r = hero.getBoundingClientRect();
            tx = ((e.clientX - r.left) / r.width - .5) * 2;
            ty = ((e.clientY - r.top) / r.height - .5) * 2;
            if (!active) { active = true; requestAnimationFrame(loop); }
        });
        hero.addEventListener('pointerleave', () => {
            tx = 0; ty = 0;
            if (!active) { active = true; requestAnimationFrame(loop); }
        });
        new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(hero);
    }

    /* ═════════════ Cinta: velocidad ligada al scroll ═════════════ */
    function initTicker() {
        const track = $('#ticker-track');
        const skew = $('.ticker__skew');
        if (!track || !skew) return;
        const originals = Array.from(track.children);
        let setW = 0, x = 0, boost = 0, sk = 0, running = false, last = 0, visible = false;

        const build = () => {
            $$('[data-clone]', track).forEach(n => n.remove());
            const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
            setW = track.scrollWidth + gap;
            const sets = Math.ceil((window.innerWidth * 2.2) / Math.max(setW, 1));
            for (let i = 0; i < sets; i++) {
                originals.forEach(n => { const c = n.cloneNode(true); c.dataset.clone = '1'; track.appendChild(c); });
            }
        };
        const loop = now => {
            if (!running) return;
            const dt = Math.min(.05, (now - last) / 1000);
            last = now;
            boost = lerp(boost, reduceMQ.matches ? 0 : S.vel * 16, .07);
            x -= (52 + boost) * dt;
            if (x <= -setW) x += setW;
            if (x > 0) x -= setW;
            sk = lerp(sk, clamp(-boost * .01, -6, 6), .1);
            track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
            skew.style.setProperty('--sk', `${sk.toFixed(2)}deg`);
            requestAnimationFrame(loop);
        };
        const run = () => { if (visible && !running && !reduceMQ.matches) { running = true; last = performance.now(); requestAnimationFrame(loop); } };
        build();
        if (document.fonts) document.fonts.ready.then(build);
        window.addEventListener('resize', debounce(build, 250));
        new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) run(); else running = false; }).observe(track.parentElement.parentElement);
    }

    /* ═════════════ MÓDULOS DE SCROLL ═════════════ */

    /* Barra de progreso, navegación y enlace activo */
    const navMod = {
        bar: $('#progress-bar'),
        nav: $('#nav'),
        links: $$('.nav__links a'),
        secs: [],
        activeId: null,
        lastY: 0,
        measure() {
            this.secs = this.links.map(a => {
                const s = $(a.getAttribute('href'));
                return s ? { id: a.getAttribute('href'), top: absTop(s), h: s.offsetHeight, a } : null;
            }).filter(Boolean);
        },
        write(s) {
            const max = Math.max(1, s.docH - s.vh);
            this.bar.style.transform = `scaleX(${clamp(s.y / max).toFixed(4)})`;
            this.nav.classList.toggle('is-stuck', s.y > 24);
            const dy = s.y - this.lastY;
            if (Math.abs(dy) > 4) {
                const menuOpen = menu && menu.classList.contains('is-open');
                this.nav.classList.toggle('is-hidden', dy > 0 && s.y > 320 && !menuOpen);
                this.lastY = s.y;
            }
            if (s.y <= 320) this.nav.classList.remove('is-hidden');
            const line = s.y + s.vh * .4;
            const cur = this.secs.find(x => line >= x.top && line < x.top + x.h);
            const id = cur ? cur.id : null;
            if (id !== this.activeId) {
                this.activeId = id;
                this.secs.forEach(x => { x.a.removeAttribute('aria-current'); });
                if (cur) cur.a.setAttribute('aria-current', 'true');
            }
        }
    };

    /* Hero: se desvanece y se aleja con el scroll */
    const heroMod = {
        el: $('#inicio'),
        h: 1,
        last: -1,
        measure() { this.h = this.el.offsetHeight; },
        write(s) {
            const p = clamp(s.y / (this.h * .95));
            if (p === this.last) return;
            this.last = p;
            this.el.style.setProperty('--hp', p.toFixed(3));
        }
    };

    /* Manifiesto: la imagen se abre a pantalla completa y las palabras se encienden */
    const mf = {
        el: $('#manifiesto'),
        words: [],
        lit: -1,
        top: 0, h: 1, sh: 1,
        init() {
            const p = $('#mf-text');
            if (!p) return;
            const text = p.textContent.trim();
            p.textContent = '';
            p.setAttribute('aria-label', text);
            text.split(/\s+/).forEach((w, i, arr) => {
                const span = document.createElement('span');
                span.className = 'mw';
                span.setAttribute('aria-hidden', 'true');
                span.textContent = w;
                p.appendChild(span);
                if (i < arr.length - 1) p.appendChild(document.createTextNode(' '));
                this.words.push(span);
            });
        },
        measure() {
            this.top = absTop(this.el);
            this.h = this.el.offsetHeight;
            this.sh = $('.mf__stage', this.el).offsetHeight;
        },
        write(s) {
            if (reduceMQ.matches) return;
            if (s.y < this.top - s.vh || s.y > this.top + this.h + s.vh) return;
            const p = clamp((s.y - this.top) / Math.max(1, this.h - this.sh));
            const e = ease.io(range(p, 0, .32));
            const st = this.el.style;
            st.setProperty('--e', e.toFixed(4));
            st.setProperty('--shade', ease.out(range(p, .24, .42)).toFixed(3));
            const idx = Math.round(range(p, .4, .84) * this.words.length);
            if (idx !== this.lit) {
                this.words.forEach((w, i) => w.classList.toggle('is-lit', i < idx));
                this.lit = idx;
            }
            this.el.classList.toggle('is-end', p > .9);
        }
    };

    /* Áreas de práctica: escenario fijo (escritorio) o tarjetas apiladas (móvil) */
    const svc = {
        track: $('#svc-track'),
        stage: $('#svc-stage'),
        items: $$('.svc-item'),
        rail: $$('.svc__rail button'),
        pin: false,
        prevPin: null,
        active: -1,
        top: 0, h: 1, stageH: 1,
        stick: [],
        tops: [],
        measure() {
            this.pin = PIN_MQ.matches;
            this.top = absTop(this.track);
            this.h = this.track.offsetHeight;
            this.stageH = this.stage.offsetHeight;
            if (this.pin !== this.prevPin) this.reset();
            this.prevPin = this.pin;
            if (!this.pin) this.stick = this.items.map(it => parseFloat(getComputedStyle(it).top) || 0);
        },
        reset() {
            this.stage.style.removeProperty('--e');
            this.stage.style.removeProperty('--stage-bg');
            this.stage.classList.remove('is-open');
            this.items.forEach(it => {
                it.style.removeProperty('--s');
                it.style.removeProperty('--dim');
                $('.svc-item__media', it).style.removeProperty('--e');
            });
            this.active = -1;
        },
        setActive(i) {
            this.active = i;
            this.items.forEach((it, k) => it.classList.toggle('is-active', k === i));
            this.stage.dataset.active = i;
            this.rail.forEach((b, k) => {
                b.classList.toggle('is-on', k === i);
                if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
            });
        },
        inView(s) { return s.y > this.top - s.vh * 1.2 && s.y < this.top + this.h + s.vh * .5; },
        read(s) {
            if (this.pin || reduceMQ.matches || !this.inView(s)) { this.tops = null; return; }
            this.tops = this.items.map(it => it.getBoundingClientRect().top);
        },
        write(s) {
            if (this.pin) {
                if (!this.inView(s)) return;
                const dist = Math.max(1, this.h - this.stageH);
                const p = clamp((s.y - this.top) / dist);
                const e = ease.io(range(p, 0, .14));
                this.stage.style.setProperty('--e', e.toFixed(4));
                const c = (a, b) => Math.round(lerp(a, b, e));
                this.stage.style.setProperty('--stage-bg', `rgb(${c(252, 18)},${c(250, 17)},${c(250, 23)})`);
                this.stage.classList.toggle('is-open', e > .94);
                const idx = Math.min(3, Math.floor(range(p, .15, 1) * 4));
                if (idx !== this.active) this.setActive(idx);
            } else if (this.tops) {
                const n = this.items.length;
                this.items.forEach((it, i) => {
                    const top = this.tops[i];
                    $('.svc-item__media', it).style.setProperty('--e', ease.out(range(s.vh * .98 - top, 0, s.vh * .55)).toFixed(3));
                    if (i < n - 1) {
                        const q = range(s.vh * .9 - this.tops[i + 1], 0, s.vh * .9 - this.stick[i + 1]);
                        it.style.setProperty('--s', (1 - .07 * q).toFixed(4));
                        it.style.setProperty('--dim', (.45 * q).toFixed(3));
                    }
                });
            }
        }
    };

    /* Método: la línea cobre se dibuja y los pasos se encienden */
    const tl = {
        el: $('#timeline'),
        steps: $$('#timeline .tl__step'),
        top: 0, h: 1, stepTops: [],
        measure() {
            this.top = absTop(this.el);
            this.h = this.el.offsetHeight;
            this.stepTops = this.steps.map(st => absTop(st));
        },
        write(s) {
            if (s.y < this.top - s.vh || s.y > this.top + this.h + s.vh) return;
            const line = s.y + s.vh * .62;
            this.el.style.setProperty('--tp', range(line, this.top + 22, this.top + this.h - 22).toFixed(4));
            this.steps.forEach((st, i) => st.classList.toggle('is-on', line >= this.stepTops[i] + 24));
        }
    };

    /* Paralaje: fondo de contacto y marca del footer */
    const parallax = {
        sec: $('#contacto'),
        bg: $('.contact__bg'),
        foot: $('.footer'),
        mark: $('.footer__mark'),
        sTop: 0, sH: 1, fTop: 0, fH: 1,
        measure() {
            this.sTop = absTop(this.sec); this.sH = this.sec.offsetHeight;
            this.fTop = absTop(this.foot); this.fH = this.foot.offsetHeight;
        },
        write(s) {
            if (reduceMQ.matches) return;
            if (s.y + s.vh > this.sTop && s.y < this.sTop + this.sH) {
                const rel = (s.y + s.vh / 2 - (this.sTop + this.sH / 2)) / (this.sH / 2 + s.vh / 2);
                this.bg.style.transform = `translate3d(0,${(clamp(rel, -1, 1) * -.1 * this.sH).toFixed(1)}px,0)`;
            }
            if (s.y + s.vh > this.fTop) {
                const p = range(s.y + s.vh, this.fTop, this.fTop + this.fH);
                this.mark.style.setProperty('--fy', ((1 - p) * 70).toFixed(1));
            }
        }
    };

    /* ───────────── Arranque ───────────── */
    function init() {
        root.classList.add('is-loading');
        initLoader();

        setupWhatsApp();
        splitHeadings();
        mf.init();
        const yr = $('#year');
        if (yr) yr.textContent = new Date().getFullYear();

        initScroll();
        mods.push(navMod, heroMod, mf, svc, tl, parallax);

        initReveal();
        initCounters();
        initBento();
        initMagnetic();
        initFaq();
        initForm();
        initMenu();
        initAnchors();
        initDust();
        initHeroPointer();
        initTicker();

        measureAll();
        window.addEventListener('resize', debounce(measureAll, 120));
        window.addEventListener('load', measureAll);
        if (document.fonts) document.fonts.ready.then(measureAll);
        if (window.ResizeObserver) new ResizeObserver(debounce(measureAll, 160)).observe(document.body);
        PIN_MQ.addEventListener('change', measureAll);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
