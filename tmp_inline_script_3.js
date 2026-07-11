
        // ===============================
        // VERSI APLIKASI (SEMANTIC VERSIONING - semver.org)
        // ===============================
        // APP_VERSION adalah SATU-SATUNYA sumber kebenaran versi di dalam file ini.
        // Setiap ada perubahan kode: naikkan MAJOR.MINOR.PATCH sesuai konvensi semver
        // (MAJOR = perubahan tak-kompatibel, MINOR = fitur baru kompatibel,
        // PATCH = perbaikan bug), lalu WAJIB samakan angka yang identik di:
        //   - sw.js       -> SW_VERSION & CACHE_NAME
        //   - manifest.json -> "version"
        //   - SKILL.md    -> "Version documented"
        //   - README.md   -> badge/judul versi
        // Ketidaksesuaian antar file akan terdeteksi otomatis saat runtime dan
        // dicatat sebagai console.warn (lihat checkVersionSync & checkManifestVersionSync).
        const APP_VERSION = "5.6.0";
        const BUILD_DATE = "20260710";
        const LEGAL_VERSION = "5.6.0"; // versi dokumen ToS/Privacy - naik hanya saat isi legal berubah
        const STORAGE_KEY = "saka_tracker_v5_4"; // kunci localStorage historis, tidak diubah agar data pengguna lama tetap kompatibel

        document.addEventListener('DOMContentLoaded', function () {
            document.title = 'Saka Tracker V' + APP_VERSION + ' - Stable';
            const badge = document.getElementById('app-version-badge');
            if (badge) badge.textContent = 'v' + APP_VERSION;
            const appName = document.getElementById('app-name-version');
            if (appName) appName.textContent = 'Saka Tracker v' + APP_VERSION + ' (Build ' + BUILD_DATE + ')';
            const footerTag = document.getElementById('footer-tagline-version');
            if (footerTag) footerTag.textContent = 'Saka Tracker v' + APP_VERSION + ' — Alat bantu internal monitoring SE2026';
        });

        // ===============================
        // CONFIG & STATE MANAGEMENT
        // ===============================
        const CONFIG = {
            startDate: new Date("2026-06-15"),
            absoluteDeadline: new Date("2026-08-30"),
            safetyBufferDays: 3,
            termin1TargetDate: new Date("2026-07-13")
        };
        const clearanceDate = new Date(CONFIG.absoluteDeadline);
        clearanceDate.setDate(clearanceDate.getDate() - CONFIG.safetyBufferDays);

        const DEFAULT_SLS_DATA = [
            { kode: "0012", nama: "RT 004 RW 03 DUSUN KARANG KOMIS", open: 61, submit: 0, reject: 0, pending: 0, approve: 0, muatan: 81 },
            { kode: "0013", nama: "RT 005 RW 03 DUSUN KARANG KOMIS", open: 44, submit: 0, reject: 0, pending: 0, approve: 0, muatan: 51 },
            { kode: "0014", nama: "RT 006 RW 03 DUSUN KARANG KOMIS", open: 48, submit: 0, reject: 0, pending: 0, approve: 0, muatan: 53 },
            { kode: "0015", nama: "RT 001 RW 04 DUSUN MASJID", open: 87, submit: 0, reject: 0, pending: 0, approve: 0, muatan: 98 },
            { kode: "0016", nama: "RT 002 RW 04 DUSUN MASJID", open: 50, submit: 0, reject: 0, pending: 0, approve: 0, muatan: 61 },
            { kode: "0017", nama: "RT 003 RW 04 DUSUN MASJID", open: 101, submit: 0, reject: 0, pending: 0, approve: 0, muatan: 107 },
            { kode: "0018", nama: "RT 004 RW 04 DUSUN MASJID", open: 125, submit: 0, reject: 0, pending: 0, approve: 0, muatan: 178 },
            { kode: "0019", nama: "RT 005 RW 04 DUSUN MASJID", open: 78, submit: 0, reject: 0, pending: 0, approve: 0, muatan: 93 },
            { kode: "0020", nama: "RT 006 RW 04 DUSUN MASJID", open: 81, submit: 0, reject: 0, pending: 0, approve: 0, muatan: 91 }
        ];

        let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
            config: { assessment: 675, muatan: 813 },
            dashboard: { open: 0, draft: 27, submit: 0, reject: 0, pending: 0, approve: 0 },
            sls: JSON.parse(JSON.stringify(DEFAULT_SLS_DATA)),
            history: [],
            apiKeys: { openai: '', gemini: '', mistral: '' },
            isAccumulationMode: false,
            consent: { accepted: false, version: null, date: null },
            security: { pinEnabled: false, pinHash: null, recoveryHash: null, failedAttempts: 0, lockUntil: null }
        };

        // ===============================
        // HELPER FUNCTIONS
        // ===============================
        function getElapsedDays() {
            const diffTime = Math.abs(new Date() - CONFIG.startDate);
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
        }

        function getSisaHariKeClearance() {
            return Math.max(1, Math.ceil((clearanceDate - new Date()) / (1000 * 60 * 60 * 24)));
        }

        // ===============================
        // SYNC FUNCTIONS - ASSESSMENT DINAMIS
        // ===============================
        function syncConfigTargets() {
            let totalMuatan = 0;
            let totalAssessment = 0;
            let totalOpen = 0;
            let totalSubmit = 0;
            let totalApprove = 0;

            state.sls.forEach(s => {
                const open = parseInt(s.open) || 0;
                const submit = parseInt(s.submit) || 0;
                const approve = parseInt(s.approve) || 0;
                const muatan = parseInt(s.muatan) || 0;

                totalOpen += open;
                totalSubmit += submit;
                totalApprove += approve;
                totalMuatan += muatan;
                totalAssessment += open + submit + approve;
            });

            state.config.muatan = totalMuatan;
            state.config.assessment = totalAssessment;
            state.dashboard.open = totalOpen;
            state.dashboard.submit = totalSubmit;
            state.dashboard.approve = totalApprove;
        }

        function syncDashboardFromSLS() {
            let totalSubmit = 0;
            let totalApprove = 0;
            let totalOpen = 0;
            let totalReject = 0;
            let totalPending = 0;

            state.sls.forEach(s => {
                totalOpen += parseInt(s.open) || 0;
                totalSubmit += parseInt(s.submit) || 0;
                totalApprove += parseInt(s.approve) || 0;
                totalReject += parseInt(s.reject) || 0;
                totalPending += parseInt(s.pending) || 0;
            });

            state.dashboard.open = totalOpen;
            state.dashboard.submit = totalSubmit;
            state.dashboard.approve = totalApprove;
            state.dashboard.reject = totalReject;
            state.dashboard.pending = totalPending;

            syncConfigTargets();
            updateHeaderStats();
        }

        // ===============================
        // UPDATE HEADER STATS
        // ===============================
        function updateHeaderStats() {
            document.getElementById('stat-open').textContent = state.dashboard.open;
            document.getElementById('stat-submit').textContent = state.dashboard.submit;
            document.getElementById('stat-approve').textContent = state.dashboard.approve;
            document.getElementById('stat-muatan').textContent = state.config.muatan;
        }

        // ===============================
        // ACCORDION TOGGLE
        // ===============================
        function toggleAccordion(el) {
            el.classList.toggle('open');
            const body = document.getElementById('accordion-body');
            body.classList.toggle('open');
        }

        // ===============================
        // INPUT LOGIC - APPROVE TIDAK DIVALIDASI
        // ===============================
        function toggleInputMode() {
            const checkbox = document.getElementById('mode-akumulasi');
            state.isAccumulationMode = checkbox.checked;
            const dateDisplay = document.getElementById('date-range-display');
            const toggleLabel = document.querySelector('.toggle-label');
            if (state.isAccumulationMode) {
                toggleLabel.innerHTML = '<i class="bi bi-calendar-range"></i> Mode Akumulasi (Rentang Tanggal)';
                if (dateDisplay) dateDisplay.style.display = "block";
            } else {
                toggleLabel.innerHTML = '<i class="bi bi-calendar-event"></i> Mode Input Harian';
                if (dateDisplay) dateDisplay.style.display = "none";
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }

        function updateSLS(idx, field, val) {
            const num = parseInt(val);

            if (isNaN(num) || num < 0) {
                state.sls[idx][field] = 0;
                if (event && event.target) event.target.value = 0;
                return;
            }

            const oldVal = state.sls[idx][field];
            const diff = num - oldVal;

            if (field === 'submit') {
                const maxSubmit = state.sls[idx].open + oldVal;
                if (num > maxSubmit) {
                    showAlert('Peringatan: Submit tidak boleh melebihi Open (' + state.sls[idx].open + ')');
                    if (event && event.target) event.target.value = oldVal;
                    return;
                }
                state.sls[idx].open -= diff;
                if (state.sls[idx].open < 0) {
                    state.sls[idx].open = 0;
                }
            }

            // APPROVE TIDAK DIVALIDASI - bisa lebih besar dari Submit atau Open
            if (field === 'approve') {
                // Approve tidak perlu validasi apapun
                // Open TIDAK berkurang otomatis dari approve
            }

            state.sls[idx][field] = num;

            syncConfigTargets();
            updateHeaderStats();

            if (field === 'submit' && diff !== 0) {
                const openInput = document.querySelectorAll('#sls-inputs-container input')[idx * 5];
                if (openInput) {
                    openInput.value = state.sls[idx].open;
                }
            }

            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }

        // ===============================
        // CORE LOGIC - PROGRESS = SUBMIT + APPROVE
        // ===============================
        function getProgress() {
            const p = state.dashboard.submit + state.dashboard.approve;
            const assessment = state.config.assessment;
            return {
                val: p,
                dashP: assessment > 0 ? (p / assessment) * 100 : 0,
                muatanP: state.config.muatan > 0 ? (p / state.config.muatan) * 100 : 0,
                open: state.dashboard.open,
                submit: state.dashboard.submit,
                approve: state.dashboard.approve,
                assessment: assessment
            };
        }

        function getVelocity() {
            if (state.history.length >= 7) {
                const last7Days = state.history.slice(-7);
                const first = last7Days[0].progress;
                const last = last7Days[last7Days.length - 1].progress;
                const diff = last - first;
                if (diff > 0) return Math.ceil(diff / 6);
            }
            const elapsedDays = getElapsedDays();
            const currentProg = getProgress().val;
            return Math.ceil(currentProg / Math.max(1, elapsedDays));
        }

        function prioritasSLS() {
            return [...state.sls].map(item => {
                const prog = item.submit + item.approve;
                const total = item.open + prog;
                const persen = total === 0 ? 0 : (prog / total) * 100;

                const openScore = Math.min(item.open * 0.8, 40);
                const approveScore = item.approve * 0.3;
                const submitScore = item.submit * 0.1;
                const muatanFactor = item.muatan ? (item.muatan / 100) : 1;

                const score = (openScore + approveScore + submitScore) * muatanFactor;

                let action = 'Monitor';
                let actionClass = 'action-lanjut';
                let actionIcon = 'bi-eye-fill';
                if (persen >= 100) {
                    action = 'Selesai';
                    actionClass = 'action-done';
                    actionIcon = 'bi-check-circle-fill';
                } else if (item.open > 50 && persen < 30) {
                    action = 'URGENT!';
                    actionClass = 'action-urgent';
                    actionIcon = 'bi-exclamation-triangle-fill';
                } else if (item.open > 30 && persen < 50) {
                    action = 'Prioritas Tinggi';
                    actionClass = 'action-urgent';
                    actionIcon = 'bi-flag-fill';
                } else if (persen > 0) {
                    action = 'Lanjutkan';
                    actionClass = 'action-lanjut';
                    actionIcon = 'bi-arrow-right-circle-fill';
                } else {
                    action = 'Mulai';
                    actionClass = 'action-mulai';
                    actionIcon = 'bi-play-circle-fill';
                }

                return { ...item, score, persen, prog, action, actionClass, actionIcon };
            }).sort((a, b) => b.score - a.score);
        }

        function performanceGrade(dashP) {
            const elapsedDays = getElapsedDays();
            const totalDays = Math.ceil((CONFIG.absoluteDeadline - CONFIG.startDate) / (1000 * 60 * 60 * 24));
            const expectedProgress = (elapsedDays / totalDays) * 100;
            const delta = dashP - expectedProgress;
            let grade, desc, color, icon;
            if (dashP >= 80 && delta > 10) { grade = 'A+'; desc = 'Excellent'; color = 'var(--accent-green)'; icon = 'bi-trophy-fill'; }
            else if (dashP >= 70 && delta > 5) { grade = 'A'; desc = 'Luar Biasa'; color = 'var(--accent-green)'; icon = 'bi-star-fill'; }
            else if (dashP >= 60 && delta >= 0) { grade = 'B'; desc = 'Baik & On Track'; color = '#3b82f6'; icon = 'bi-check-circle-fill'; }
            else if (dashP >= 50 && delta >= -5) { grade = 'C'; desc = 'Sedang, Perlu Percepatan'; color = 'var(--accent-orange)'; icon = 'bi-exclamation-triangle-fill'; }
            else if (dashP >= 40 && delta >= -10) { grade = 'D'; desc = 'Di Bawah Target'; color = '#f59e0b'; icon = 'bi-graph-down'; }
            else { grade = 'E'; desc = 'Kritis! Butuh Aksi Cepat'; color = 'var(--accent-red)'; icon = 'bi-exclamation-octagon-fill'; }
            return { g: grade, d: desc, c: color, icon: icon, delta: delta.toFixed(1) };
        }

        function generateSLSDetail(slsItem, rank) {
            const status = slsItem.persen === 100 ? 'selesai' : slsItem.prog > 0 ? 'sedang berjalan' : 'belum dimulai';
            let strategy = '';
            if (rank <= 3) strategy = '<i class="bi bi-exclamation-circle-fill" style="color:var(--accent-red);"></i> PRIORITAS UTAMA. Fokuskan resource untuk menutup ' + slsItem.open + ' item open tersisa.';
            else if (slsItem.open > 80) strategy = '<i class="bi bi-bar-chart-fill"></i> Volume open sangat tinggi (' + slsItem.open + '). Butuh delegasi agar tidak jadi bottleneck.';
            else if (slsItem.persen < 20) strategy = '<i class="bi bi-hourglass-split"></i> Progress rendah (' + slsItem.persen.toFixed(0) + '%). Mulai percepatan dengan pendekatan door-to-door.';
            else strategy = '<i class="bi bi-pin-angle-fill"></i> Status: ' + status + '. Lakukan monitoring mingguan.';
            return '<strong>Kode:</strong> ' + slsItem.kode + ' | <strong>Alamat:</strong> ' + slsItem.nama + '<br>' +
                '<strong>Detail:</strong> Open: ' + slsItem.open + ', Submit: ' + slsItem.submit + ', Approve: ' + slsItem.approve + '<br>' +
                '<strong>Progress:</strong> ' + slsItem.persen.toFixed(0) + '% (' + slsItem.prog + ' dari ' + (slsItem.open + slsItem.prog) + ')<br><br>' +
                '<strong><i class="bi bi-bullseye"></i> Strategi AI:</strong> ' + strategy;
        }

        // ===============================
        // RENDER FUNCTIONS
        // ===============================
        function renderTerminAlert(prog) {
            const card = document.getElementById('termin-alert-card');
            const statusDiv = document.getElementById('termin-status');
            const today = new Date();
            const targetDate = CONFIG.termin1TargetDate;
            const isPastDeadline = today > targetDate;
            const isTargetMet = prog.dashP >= 40;

            const daysLeft = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
            const targetProgress = 40;
            const targetFinal = 100;
            const currentProgress = prog.dashP;
            const gapToTarget = Math.max(0, targetProgress - currentProgress);
            const gapToFinal = Math.max(0, targetFinal - currentProgress);
            const progressPerDay = daysLeft > 0 ? gapToTarget / daysLeft : 0;

            const totalData = state.config.assessment;
            const currentData = prog.val;
            const target40Data = Math.ceil(totalData * 0.4);
            const target100Data = totalData;
            const gapDataTo40 = Math.max(0, target40Data - currentData);
            const gapDataTo100 = Math.max(0, target100Data - currentData);
            const dataPerDayTo40 = daysLeft > 0 ? Math.ceil(gapDataTo40 / daysLeft) : 0;
            const currVel = getVelocity();
            const sisaHariKeClearance = getSisaHariKeClearance();
            const dataPerDayTo100 = sisaHariKeClearance > 0 ? Math.ceil(gapDataTo100 / sisaHariKeClearance) : 0;
            const estimatedDaysTo40 = currVel > 0 ? Math.ceil(gapDataTo40 / currVel) : Infinity;
            const estimatedDaysTo100 = currVel > 0 ? Math.ceil(gapDataTo100 / currVel) : Infinity;

            card.style.display = 'block';

            if (!isTargetMet) {
                let statusHTML = '';
                if (isPastDeadline) {
                    statusHTML = `<div class="forecast-box forecast-crit" style="flex-direction:column; align-items:stretch; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px; font-size:1rem;">
                    <i class="bi bi-exclamation-octagon-fill" style="font-size:1.3rem; color:var(--accent-red);"></i>
                    <strong style="color:var(--accent-red);">KRITIS! Termin 1 GAGAL</strong>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.85rem; background:#0f172a; padding:8px; border-radius:8px;">
                    <div><i class="bi bi-graph-up"></i> Progress:</div>
                    <div style="font-weight:bold; color:var(--accent-red);">${currentProgress.toFixed(2)}% (${currentData} data)</div>
                    <div><i class="bi bi-bullseye"></i> Target 40%:</div>
                    <div style="font-weight:bold; color:var(--accent-red);">${target40Data} data</div>
                    <div><i class="bi bi-calendar-event"></i> Deadline:</div>
                    <div style="font-weight:bold;">${targetDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    <div><i class="bi bi-clock"></i> Keterlambatan:</div>
                    <div style="font-weight:bold; color:var(--accent-red);">${Math.abs(daysLeft)} hari</div>
                </div>
                <div style="background:rgba(239,68,68,0.15); padding:8px; border-radius:8px; text-align:center; font-weight:bold; color:var(--accent-red); font-size:0.85rem;">
                    <i class="bi bi-lightning-fill"></i> SEGERA PERCEPAT APPROVAL! Target tidak tercapai tepat waktu.
                </div>
            </div>`;
                } else if (daysLeft <= 3 && currentProgress < 30) {
                    statusHTML = `<div class="forecast-box forecast-crit" style="flex-direction:column; align-items:stretch; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px; font-size:1rem;">
                    <i class="bi bi-exclamation-octagon-fill" style="font-size:1.3rem; color:var(--accent-red);"></i>
                    <strong style="color:var(--accent-red);">KRITIS! Hanya ${daysLeft} Hari Tersisa!</strong>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.85rem; background:#0f172a; padding:8px; border-radius:8px;">
                    <div><i class="bi bi-graph-up"></i> Progress:</div>
                    <div style="font-weight:bold; color:var(--accent-orange);">${currentProgress.toFixed(2)}% (${currentData} data)</div>
                    <div><i class="bi bi-bullseye"></i> Target 40%:</div>
                    <div style="font-weight:bold; color:var(--accent-orange);">${target40Data} data</div>
                    <div><i class="bi bi-arrow-up-circle"></i> Gap ke 40%:</div>
                    <div style="font-weight:bold; color:var(--accent-red);">${gapDataTo40} data (${gapToTarget.toFixed(1)}%)</div>
                    <div><i class="bi bi-calendar-event"></i> Sisa Hari:</div>
                    <div style="font-weight:bold; color:var(--accent-red);">${daysLeft} hari</div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; background:#0f172a; padding:8px; border-radius:8px;">
                    <div style="text-align:center;">
                        <div style="color:var(--text-muted); font-size:0.65rem;"><i class="bi bi-speedometer2"></i> Butuh/hari (40%)</div>
                        <div style="font-weight:bold; font-size:1.1rem; color:var(--accent-red);">${dataPerDayTo40} data</div>
                        <div style="font-size:0.65rem; color:var(--text-muted);">(${progressPerDay.toFixed(1)}%)</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="color:var(--text-muted); font-size:0.65rem;"><i class="bi bi-graph-up-arrow"></i> Ritme Saat Ini</div>
                        <div style="font-weight:bold; font-size:1.1rem; color:${currVel >= dataPerDayTo40 ? 'var(--accent-green)' : 'var(--accent-red)'};">${currVel} data/hari</div>
                        <div style="font-size:0.65rem; color:${currVel >= dataPerDayTo40 ? 'var(--accent-green)' : 'var(--accent-red)'};">${currVel >= dataPerDayTo40 ? '<i class="bi bi-check-circle-fill"></i> Cukup' : '<i class="bi bi-x-circle-fill"></i> Kurang ' + (dataPerDayTo40 - currVel) + ' data/hari'}</div>
                    </div>
                </div>
                <div style="background:rgba(59,130,246,0.08); padding:8px; border-radius:8px; border-left:3px solid var(--accent-blue);">
                    <div style="font-weight:bold; margin-bottom:4px; font-size:0.8rem;"><i class="bi bi-flag-fill"></i> Target Final 100%</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.8rem;">
                        <div><i class="bi bi-arrow-up-circle"></i> Gap: <strong style="color:var(--accent-blue);">${gapDataTo100} data (${gapToFinal.toFixed(1)}%)</strong></div>
                        <div><i class="bi bi-speedometer2"></i> Butuh/hari: <strong style="color:${dataPerDayTo100 > 15 ? 'var(--accent-red)' : 'var(--accent-orange)'};">${dataPerDayTo100} data</strong></div>
                        <div style="grid-column:1/-1;"><i class="bi bi-clock"></i> Estimasi selesai: <strong style="color:${estimatedDaysTo100 <= sisaHariKeClearance ? 'var(--accent-green)' : 'var(--accent-red)'};">${estimatedDaysTo100 === Infinity ? '∞' : estimatedDaysTo100 + ' hari'}</strong></div>
                    </div>
                </div>
                <div style="background:rgba(239,68,68,0.1); padding:8px; border-radius:8px; text-align:center; font-size:0.85rem;">
                    <i class="bi bi-lightning-fill" style="color:var(--accent-orange);"></i> Butuh <strong style="color:var(--accent-red);">${dataPerDayTo40} data/hari</strong> untuk mencapai 40%! Fokus di 3 SLS prioritas dengan open tinggi.
                </div>
            </div>`;
                } else if (daysLeft <= 7) {
                    const statusText = currentProgress > 30 ? 'Perlu AKSI CEPAT' : 'Kondisi KRITIS!';
                    const borderColor = currentProgress > 30 ? 'var(--accent-orange)' : 'var(--accent-red)';
                    statusHTML = `<div class="forecast-box forecast-warn" style="flex-direction:column; align-items:stretch; gap:10px; border-left:4px solid ${borderColor};">
                <div style="display:flex; align-items:center; gap:10px; font-size:1rem;">
                    <i class="bi bi-exclamation-triangle-fill" style="font-size:1.3rem; color:${borderColor};"></i>
                    <strong style="color:${borderColor};">${daysLeft} Hari Menuju Termin 1 - ${statusText}</strong>
                </div>
                <div style="background:#1e293b; border-radius:8px; padding:10px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px;">
                        <span><i class="bi bi-graph-up"></i> Progress: ${currentProgress.toFixed(1)}% (${currentData} data)</span>
                        <span><i class="bi bi-bullseye"></i> Target 40%: ${target40Data} data</span>
                    </div>
                    <div style="background:#334155; border-radius:4px; height:22px; overflow:hidden; position:relative;">
                        <div style="background:${currentProgress > 35 ? 'var(--accent-green)' : currentProgress > 30 ? 'var(--accent-orange)' : 'var(--accent-red)'}; height:100%; width:${Math.min(100, currentProgress)}%; transition:width 0.5s ease;"></div>
                        <div style="position:absolute; right:0; top:0; height:100%; width:${Math.max(0, 40 - currentProgress)}%; background:rgba(255,255,255,0.05); border-left:2px dashed var(--accent-orange);"></div>
                        <div style="position:absolute; left:40%; top:50%; transform:translate(-50%, -50%); font-size:0.55rem; font-weight:bold; color:white; text-shadow:0 0 4px rgba(0,0,0,0.8);"><i class="bi bi-bullseye"></i> 40%</div>
                        <div style="position:absolute; left:${Math.min(100, currentProgress)}%; top:50%; transform:translate(-50%, -50%); font-size:0.55rem; font-weight:bold; color:white; text-shadow:0 0 4px rgba(0,0,0,0.8);">${currentProgress.toFixed(0)}%</div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:0.65rem; color:var(--text-muted); margin-top:2px;">
                        <span>Saat Ini (${currentData} data)</span>
                        <span style="color:var(--accent-orange);"><i class="bi bi-arrow-up"></i> Gap ${gapDataTo40} data (${gapToTarget.toFixed(1)}%)</span>
                        <span>Target 40%</span>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; font-size:0.8rem;">
                    <div style="background:#0f172a; padding:6px; border-radius:6px; text-align:center;">
                        <div style="color:var(--text-muted); font-size:0.65rem;"><i class="bi bi-calendar-range"></i> Sisa Hari</div>
                        <div style="font-weight:bold; font-size:1rem; ${daysLeft <= 5 ? 'color:var(--accent-red)' : 'color:var(--accent-orange)'}">${daysLeft}</div>
                    </div>
                    <div style="background:#0f172a; padding:6px; border-radius:6px; text-align:center;">
                        <div style="color:var(--text-muted); font-size:0.65rem;"><i class="bi bi-arrow-up-circle"></i> Gap ke 40%</div>
                        <div style="font-weight:bold; font-size:1rem; color:var(--accent-orange);">${gapDataTo40} data</div>
                        <div style="font-size:0.65rem; color:var(--text-muted);">(${gapToTarget.toFixed(1)}%)</div>
                    </div>
                    <div style="background:#0f172a; padding:6px; border-radius:6px; text-align:center;">
                        <div style="color:var(--text-muted); font-size:0.65rem;"><i class="bi bi-speedometer2"></i> Butuh/hari</div>
                        <div style="font-weight:bold; font-size:1rem; ${dataPerDayTo40 > 5 ? 'color:var(--accent-red)' : 'color:var(--accent-orange)'}">${dataPerDayTo40} data</div>
                        <div style="font-size:0.65rem; color:var(--text-muted);">(${progressPerDay.toFixed(1)}%)</div>
                    </div>
                </div>
                <div style="background:rgba(59,130,246,0.06); padding:8px; border-radius:8px; border-left:3px solid var(--accent-blue);">
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px; font-size:0.75rem;">
                        <div><div style="color:var(--text-muted);"><i class="bi bi-flag-fill"></i> Target 100%</div><div style="font-weight:bold;">${target100Data} data</div></div>
                        <div><div style="color:var(--text-muted);"><i class="bi bi-arrow-up-circle"></i> Gap</div><div style="font-weight:bold; color:var(--accent-blue);">${gapDataTo100} data</div></div>
                        <div><div style="color:var(--text-muted);"><i class="bi bi-speedometer2"></i> Butuh/hari</div><div style="font-weight:bold; color:${dataPerDayTo100 > 15 ? 'var(--accent-red)' : 'var(--accent-orange)'};">${dataPerDayTo100} data</div></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-top:4px; padding-top:4px; border-top:1px solid var(--border);">
                        <span><i class="bi bi-clock"></i> Estimasi Selesai (ritme ${currVel}/hari)</span>
                        <span style="font-weight:bold; color:${estimatedDaysTo100 <= sisaHariKeClearance ? 'var(--accent-green)' : 'var(--accent-red)'};">${estimatedDaysTo100 === Infinity ? '∞ (belum ada ritme)' : estimatedDaysTo100 + ' hari'}</span>
                    </div>
                </div>
                <div style="background:rgba(59,130,246,0.08); padding:8px; border-radius:8px; text-align:center; font-size:0.8rem; border-left:3px solid var(--accent-blue);">
                    <i class="bi bi-lightbulb-fill" style="color:var(--accent-blue);"></i> <strong>Strategi:</strong> Percepat approval di 3 SLS prioritas (0018, 0019, 0020). ${dataPerDayTo40 > 5 ? '<i class="bi bi-exclamation-triangle-fill" style="color:var(--accent-red);"></i> Perlu tambahan tenaga lapangan!' : 'Fokus pada SLS dengan open > 50 unit.'} ${dataPerDayTo40 > currVel ? ' Butuh tambahan <strong>' + (dataPerDayTo40 - currVel) + ' data/hari</strong> dari ritme saat ini.' : ''}
                </div>
            </div>`;
                } else {
                    statusHTML = `<div class="forecast-box forecast-warn" style="flex-direction:column; align-items:stretch; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <i class="bi bi-info-circle-fill" style="color:var(--accent-orange); font-size:1.2rem;"></i>
                    <span style="font-size:0.85rem;"><i class="bi bi-calendar-event"></i> Termin 1: ${daysLeft} hari menuju deadline <strong>${targetDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</strong></span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.8rem; background:#0f172a; padding:8px; border-radius:8px;">
                    <div><i class="bi bi-graph-up"></i> Progress: <strong style="color:var(--accent-blue);">${currentProgress.toFixed(2)}% (${currentData} data)</strong></div>
                    <div><i class="bi bi-bullseye"></i> Target 40%: <strong style="color:var(--accent-green);">${target40Data} data</strong></div>
                    <div><i class="bi bi-arrow-up-circle"></i> Gap ke 40%: <strong style="color:var(--accent-orange);">${gapDataTo40} data (${gapToTarget.toFixed(1)}%)</strong></div>
                    <div><i class="bi bi-speedometer2"></i> Butuh/hari: <strong style="color:${dataPerDayTo40 > 3 ? 'var(--accent-orange)' : 'var(--accent-green)'};">${dataPerDayTo40} data (${progressPerDay.toFixed(1)}%)</strong></div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.75rem; background:#0f172a; padding:6px; border-radius:8px;">
                    <div><i class="bi bi-flag-fill"></i> Target 100%: <strong>${target100Data} data</strong></div>
                    <div><i class="bi bi-arrow-up-circle"></i> Gap ke 100%: <strong style="color:var(--accent-blue);">${gapDataTo100} data (${gapToFinal.toFixed(1)}%)</strong></div>
                    <div><i class="bi bi-speedometer2"></i> Butuh/hari (100%): <strong style="color:${dataPerDayTo100 > 15 ? 'var(--accent-red)' : 'var(--accent-orange)'};">${dataPerDayTo100} data</strong></div>
                    <div><i class="bi bi-clock"></i> Estimasi selesai: <strong style="color:${estimatedDaysTo100 <= sisaHariKeClearance ? 'var(--accent-green)' : 'var(--accent-red)'};">${estimatedDaysTo100 === Infinity ? '∞' : estimatedDaysTo100 + ' hari'}</strong></div>
                </div>
                ${dataPerDayTo40 > 2 ? '<div style="font-size:0.75rem; color:var(--accent-orange); text-align:center;"><i class="bi bi-exclamation-triangle-fill"></i> Perlu percepatan! Target harian di atas 2% (' + dataPerDayTo40 + ' data/hari)</div>' : ''}
            </div>`;
                }
                statusDiv.innerHTML = statusHTML;
            } else {
                const gapToFinalData = target100Data - currentData;
                const daysToClearance = getSisaHariKeClearance();
                const dataPerDayToFinal = daysToClearance > 0 ? Math.ceil(gapToFinalData / daysToClearance) : 0;
                statusDiv.innerHTML = `<div class="forecast-box forecast-ok" style="flex-direction:column; align-items:stretch; gap:8px;">
            <div style="display:flex; align-items:center; gap:10px; font-size:1rem;">
                <i class="bi bi-check-circle-fill" style="color:var(--accent-green); font-size:1.3rem;"></i>
                <strong style="color:var(--accent-green);">TERMIN 1 TERCAPAI! (40%)</strong>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.85rem; background:#0f172a; padding:8px; border-radius:8px;">
                <div><i class="bi bi-graph-up"></i> Progress: <strong style="color:var(--accent-green);">${currentProgress.toFixed(2)}% (${currentData} data)</strong></div>
                <div><i class="bi bi-bullseye"></i> Target 40%: <strong style="color:var(--accent-green);"><i class="bi bi-check-circle-fill"></i> ${target40Data} data</strong></div>
                <div><i class="bi bi-calendar-event"></i> Deadline: <strong>${targetDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</strong></div>
                <div><i class="bi bi-clock"></i> Selesai: <strong style="color:var(--accent-green);">${daysLeft < 0 ? Math.abs(daysLeft) + ' hari lebih cepat' : 'Tepat waktu'}</strong></div>
            </div>
            <div style="background:rgba(16,185,129,0.08); padding:8px; border-radius:8px; border-left:3px solid var(--accent-green);">
                <div style="font-weight:bold; margin-bottom:4px; font-size:0.8rem;"><i class="bi bi-flag-fill"></i> Target Final 100%</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.8rem;">
                    <div><i class="bi bi-arrow-up-circle"></i> Gap ke 100%: <strong style="color:var(--accent-blue);">${gapToFinalData} data (${gapToFinal.toFixed(1)}%)</strong></div>
                    <div><i class="bi bi-speedometer2"></i> Butuh/hari (100%): <strong style="color:${dataPerDayToFinal > 15 ? 'var(--accent-red)' : 'var(--accent-orange)'};">${dataPerDayToFinal} data</strong></div>
                    <div><i class="bi bi-graph-up"></i> Ritme Saat Ini: <strong style="color:${currVel >= dataPerDayToFinal ? 'var(--accent-green)' : 'var(--accent-orange)'};">${currVel} data/hari</strong></div>
                    <div><i class="bi bi-clock"></i> Estimasi Selesai: <strong style="color:${estimatedDaysTo100 <= daysToClearance ? 'var(--accent-green)' : 'var(--accent-red)'};">${estimatedDaysTo100 === Infinity ? '∞' : estimatedDaysTo100 + ' hari'}</strong></div>
                </div>
            </div>
            <div style="background:rgba(16,185,129,0.08); padding:6px; border-radius:8px; text-align:center; font-size:0.8rem; color:var(--text-muted);">
                <i class="bi bi-rocket-takeoff"></i> Pertahankan ritme untuk clearance 27 Agustus 2026!
                ${currVel < dataPerDayToFinal ? ' Perlu tambahan <strong>' + (dataPerDayToFinal - currVel) + ' data/hari</strong> untuk mencapai 100% tepat waktu.' : ''}
            </div>
        </div>`;
            }
        }

        function renderForecast() {
            const prog = getProgress();
            const sisaHari = getSisaHariKeClearance();
            const remaining = state.config.assessment - prog.val;
            const reqVel = Math.ceil(remaining / sisaHari);
            const currVel = getVelocity();
            const isOnTrack = currVel >= reqVel;
            const dateStr = clearanceDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const statusDiv = document.getElementById('forecast-status');
            const detailDiv = document.getElementById('forecast-details');
            let boxClass, icon, text;
            if (currVel === 0) {
                boxClass = 'forecast-crit';
                icon = '<i class="bi bi-x-octagon-fill"></i>';
                text = 'BELUM ADA RITME: Butuh ' + reqVel + ' data/hari untuk clearance ' + dateStr;
                detailDiv.innerHTML = 'Belum ada progress yang tercatat. Mulai input data harian untuk tracking yang akurat.';
            } else if (isOnTrack) {
                boxClass = 'forecast-ok';
                icon = '<i class="bi bi-check-circle-fill"></i>';
                text = 'ON TRACK: Clearance aman sebelum ' + dateStr;
                const estimatedDays = Math.ceil(remaining / currVel);
                const bufferDays = sisaHari - estimatedDays;
                detailDiv.innerHTML = 'Ritme <strong>' + currVel + ' data/hari</strong> cukup. Estimasi selesai: <strong>' + estimatedDays + ' hari</strong> (buffer ' + (bufferDays > 0 ? bufferDays : 0) + ' hari).';
            } else {
                boxClass = currVel >= reqVel * 0.7 ? 'forecast-warn' : 'forecast-crit';
                icon = currVel >= reqVel * 0.7 ? '<i class="bi bi-exclamation-triangle-fill"></i>' : '<i class="bi bi-x-octagon-fill"></i>';
                text = currVel >= reqVel * 0.7 ? 'WARNING: Margin tipis untuk clearance ' + dateStr : 'CRITICAL: Tidak mencapai clearance ' + dateStr;
                const estimatedDays = Math.ceil(remaining / currVel);
                const keterlambatan = estimatedDays - sisaHari;
                detailDiv.innerHTML = 'Kekurangan ritme: <strong>' + (reqVel - currVel) + ' data/hari</strong>. Estimasi selesai: <strong>' + estimatedDays + ' hari</strong> (terlambat ' + (keterlambatan > 0 ? keterlambatan : 0) + ' hari).';
            }
            statusDiv.innerHTML = '<div class="forecast-box ' + boxClass + '">' + icon + ' ' + text + '</div>';
        }

        function renderTargetsAndComparison(prog) {
            document.getElementById('comp-dash-persen').innerText = prog.dashP.toFixed(2) + '%';
            document.getElementById('comp-muatan-persen').innerText = prog.muatanP.toFixed(2) + '%';
            const sisaHari = getSisaHariKeClearance();
            const remaining = state.config.assessment - prog.val;
            const reqVel = Math.ceil(remaining / sisaHari);
            const currVel = getVelocity();
            document.getElementById('curr-velocity').innerText = currVel + ' data/hari';
            document.getElementById('req-velocity').innerText = reqVel + ' data/hari';
        }

        function renderDifferenceAnalysis() {
            const baselineAssessment = 675, baselineMuatan = 813;
            const currentAssessment = state.config.assessment, currentMuatan = state.config.muatan;
            const diffAssessment = currentAssessment - baselineAssessment;
            const diffMuatan = currentMuatan - baselineMuatan;
            const box = document.getElementById('diff-analysis-box');
            const diffAssEl = document.getElementById('diff-assessment');
            const diffMutEl = document.getElementById('diff-muatan');
            if (diffAssessment !== 0 || diffMuatan !== 0) {
                box.style.display = 'block';
                const formatDiff = (val) => {
                    if (val > 0) return '<span style="color:var(--accent-green)">+' + val + ' unit</span>';
                    if (val < 0) return '<span style="color:var(--accent-red)">' + val + ' unit</span>';
                    return '0 unit';
                };
                diffAssEl.innerHTML = formatDiff(diffAssessment);
                diffMutEl.innerHTML = formatDiff(diffMuatan);
            } else {
                box.style.display = 'none';
            }
        }

        function renderPriorityAccordions() {
            const list = prioritasSLS();
            const container = document.getElementById('priority-list');
            container.innerHTML = '';
            list.forEach((s, i) => {
                const item = document.createElement('div');
                item.className = 'priority-item';
                item.innerHTML = `<div class="priority-header" onclick="toggleDetail(this)">
            <div style="display:flex; align-items:center;">
                <div class="p-rank">${i + 1}</div>
                <div class="p-info">
                    <div class="p-code">${s.kode}</div>
                    <div class="p-score">Score: ${s.score.toFixed(0)} | Prog: ${s.persen.toFixed(0)}%</div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="p-action ${s.actionClass}"><i class="bi ${s.actionIcon}"></i> ${s.action}</span>
                <i class="bi bi-chevron-down toggle-icon"></i>
            </div>
        </div>
        <div class="priority-detail"><div class="detail-content">${generateSLSDetail(s, i + 1)}</div></div>`;
                container.appendChild(item);
            });
        }

        function toggleDetail(headerEl) {
            const item = headerEl.parentElement;
            const detail = item.querySelector('.priority-detail');
            item.classList.toggle('expanded');
            detail.classList.toggle('open');
        }

        function renderPerformance(prog, perf) {
            const gradeEl = document.getElementById('perf-grade');
            gradeEl.innerText = perf.g;
            gradeEl.style.color = perf.c;
            document.getElementById('perf-desc').innerHTML = '<i class="bi ' + perf.icon + '"></i> ' + perf.d;
            document.getElementById('perf-delta').innerHTML = '<i class="bi bi-bar-chart-fill"></i> ' + (perf.delta > 0 ? 'Di atas target' : 'Di bawah target') + ' ' + Math.abs(perf.delta) + '%';
            document.getElementById('dash-persen').innerText = prog.dashP.toFixed(2) + '%';
            document.getElementById('dash-bar').style.width = Math.min(100, prog.dashP) + '%';
        }

        // ===============================
        // AI INSIGHT - CLEAN MARKDOWN
        // ===============================
        function cleanAIResponse(text) {
            if (!text) return '<p style="color:var(--text-muted); font-style:italic;">Tidak ada insight yang dihasilkan.</p>';

            // Replace markdown headers
            let cleaned = text
                .replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
                .replace(/^###\s+(.*)$/gm, '<h4>$1</h4>')
                .replace(/^##\s+(.*)$/gm, '<h4>$1</h4>')
                .replace(/^#\s+(.*)$/gm, '<h4>$1</h4>')
                // Bold
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                // Italic
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                // Lists
                .replace(/^-\s+(.*)$/gm, '<li>$1</li>')
                .replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>')
                // Wrap lists
                .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
                // Line breaks
                .replace(/\n/g, '<br>');

            // Wrap sections
            cleaned = cleaned.replace(/<h4>([^<]+)<\/h4>/g, (match, title) => {
                const isRisk = title.toLowerCase().includes('risiko') || title.toLowerCase().includes('risk');
                const isSuccess = title.toLowerCase().includes('rekomendasi') || title.toLowerCase().includes('strategi');
                const cls = isRisk ? 'risk' : isSuccess ? 'success' : '';
                return `<div class="ai-section ${cls}"><h4>${title}</h4>`;
            });

            // Close ai-section divs
            cleaned = cleaned.replace(/<\/h4>/g, '</h4></div>');

            // Fix double divs
            cleaned = cleaned.replace(/<\/div><div class="ai-section/g, '</div><div class="ai-section');

            // Clean up extra tags
            cleaned = cleaned.replace(/<\/h4><\/div><\/h4>/g, '</h4></div>');

            return cleaned;
        }

        // ===============================
        // HISTORY FUNCTIONS
        // ===============================
        function renderHistory() {
            const container = document.getElementById('history-list');
            const countEl = document.getElementById('history-count');

            if (!state.history || state.history.length === 0) {
                container.innerHTML = `<div class="empty-state">
            <i class="bi bi-inbox"></i>
            <p>Belum ada history. Lakukan analisis untuk menyimpan snapshot.</p>
        </div>`;
                countEl.innerText = '0';
                return;
            }

            countEl.innerText = state.history.length;
            const sortedHistory = [...state.history].reverse();

            container.innerHTML = '';
            sortedHistory.forEach((item, index) => {
                const originalIndex = state.history.length - 1 - index;
                const grade = item.grade || '-';
                const velocity = item.velocity || 0;
                const progress = item.progress || 0;
                const dashP = item.dashP || 0;

                const card = document.createElement('div');
                card.className = 'history-card';
                card.innerHTML = `
            <div class="history-header">
                <div class="history-date">
                    <i class="bi bi-calendar3"></i>
                    ${item.date}
                    <span style="font-size:0.65rem; color:var(--text-muted); font-weight:normal; margin-left:6px;">
                        #${state.history.length - originalIndex}
                    </span>
                </div>
                <button class="btn-danger" onclick="deleteHistory(${originalIndex})" style="padding:4px 8px; font-size:0.65rem;">
                    <i class="bi bi-trash3"></i>
                </button>
            </div>
            <div class="history-stats">
                <div class="history-stat-item">
                    <div class="history-stat-label"><i class="bi bi-graph-up"></i> Progress</div>
                    <div class="history-stat-value" style="color:${dashP >= 40 ? 'var(--accent-green)' : 'var(--accent-orange)'};">${dashP.toFixed(1)}%</div>
                </div>
                <div class="history-stat-item">
                    <div class="history-stat-label"><i class="bi bi-database"></i> Data</div>
                    <div class="history-stat-value">${progress}</div>
                </div>
                <div class="history-stat-item">
                    <div class="history-stat-label"><i class="bi bi-speedometer2"></i> Ritme</div>
                    <div class="history-stat-value">${velocity}/hari</div>
                </div>
                <div class="history-stat-item">
                    <div class="history-stat-label"><i class="bi bi-trophy"></i> Grade</div>
                    <div class="history-stat-value" style="color:${grade === 'A+' || grade === 'A' ? 'var(--accent-green)' : grade === 'B' ? '#3b82f6' : grade === 'C' ? 'var(--accent-orange)' : 'var(--accent-red)'};">${grade}</div>
                </div>
            </div>
        `;
                container.appendChild(card);
            });
        }

        function deleteHistory(index) {
            if (confirm('Hapus snapshot tanggal ' + state.history[index].date + '?')) {
                state.history.splice(index, 1);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                renderHistory();
            }
        }

        function clearAllHistory() {
            if (state.history.length === 0) return;
            if (confirm('Hapus semua ' + state.history.length + ' snapshot history?')) {
                state.history = [];
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                renderHistory();
            }
        }

        // ===============================
        // MAIN ACTIONS
        // ===============================
        async function runAnalysis() {
            const btn = document.getElementById('btn-analyze');
            btn.disabled = true;
            btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Sedang Menganalisis...';

            syncDashboardFromSLS();
            syncConfigTargets();
            state.dashboard.draft = parseInt(document.getElementById('global-draft').value) || 0;

            const prog = getProgress();
            const perf = performanceGrade(prog.dashP);

            const todayStr = new Date().toLocaleDateString('id-ID');

            const existingToday = state.history.find(h => h.date === todayStr);
            if (!existingToday) {
                state.history.push({
                    date: todayStr,
                    progress: prog.val,
                    dashP: prog.dashP,
                    velocity: getVelocity(),
                    grade: perf.g
                });
            } else {
                existingToday.progress = prog.val;
                existingToday.dashP = prog.dashP;
                existingToday.velocity = getVelocity();
                existingToday.grade = perf.g;
            }

            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

            renderTerminAlert(prog);
            renderForecast();
            renderTargetsAndComparison(prog);
            renderDifferenceAnalysis();
            renderPriorityAccordions();
            renderPerformance(prog, perf);
            updateHeaderStats();

            const orchestrator = new HybridAIOrchestrator(state.apiKeys);
            const top3 = prioritasSLS().slice(0, 3);
            const elapsedDays = state.history.length > 1 ? state.history.length - 1 : 23;
            const modeText = state.isAccumulationMode ? '(Akumulasi ' + elapsedDays + ' hari)' : '(Harian)';

            const aiPrompt = 'Analisis progres Saka Tracker ' + modeText + ': ' +
                'Progress Dashboard ' + prog.dashP.toFixed(2) + '% (' + prog.val + ' unit). ' +
                'Ritme rata-rata 7 hari: ' + getVelocity() + ' data/hari. ' +
                'Status Termin 1 (Target 40%): ' + (prog.dashP >= 40 ? 'Tercapai' : 'Belum Tercapai') + '. ' +
                'Top 3 SLS prioritas: ' + top3.map(s => s.kode + ' (' + s.open + ' open)').join(', ') + '. ' +
                'Berikan insight strategis singkat dengan format: gunakan #### untuk judul bagian, **tebal** untuk penekanan, dan - untuk poin-poin.';

            const insight = await orchestrator.generateInsight(aiPrompt);
            document.getElementById('ai-insights').innerHTML = cleanAIResponse(insight);

            const container = document.getElementById('analysis-container');
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '12px';
            setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-cpu"></i> ANALISIS & SIMPAN SNAPSHOT';

            if (document.getElementById('page-history').classList.contains('active')) {
                renderHistory();
            }
        }

        // ===============================
        // NAVIGATION
        // ===============================
        function switchPage(pageName) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

            const targetPage = document.getElementById('page-' + pageName);
            if (targetPage) targetPage.classList.add('active');

            const navItems = document.querySelectorAll('.nav-item');
            const pageMap = { 'dashboard': 0, 'data': 1, 'history': 2, 'formgear': 3, 'formbuilder': 4, 'settings': 5 };
            if (pageMap[pageName] !== undefined && navItems[pageMap[pageName]]) {
                navItems[pageMap[pageName]].classList.add('active');
            }

            if (pageName === 'history') renderHistory();
            if (pageName === 'formgear' && window.initFormGearDemo) window.initFormGearDemo();
            if (pageName === 'formbuilder' && window.initFormBuilder) window.initFormBuilder();

            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // ===============================
        // CRUD DATA SLS
        // ===============================
        function renderDataSLSPage() {
            const list = document.getElementById('data-sls-list');
            list.innerHTML = '';
            state.sls.forEach((s, idx) => {
                const row = document.createElement('div');
                row.className = 'data-sls-row';
                row.style.cssText = "display: grid; grid-template-columns: 60px 1fr 1fr 40px; gap: 8px; align-items: center; margin-bottom: 8px; padding: 8px 10px; background: #0f172a; border-radius: 10px; border: 1px solid var(--border);";
                row.innerHTML = `
            <input type="text" value="${s.kode}" onchange="updateDataSLS(${idx}, 'kode', this.value)" style="text-align:center; font-weight:bold; color:var(--accent-blue); background:transparent; border:none; font-size:0.85rem;">
            <input type="number" value="${s.open}" onchange="updateDataSLS(${idx}, 'open', this.value)" placeholder="Open FASIH" style="background:#0f172a; border:1px solid var(--border); color:white; padding:8px; border-radius:8px; width:100%; text-align:center; font-size:0.85rem;">
            <input type="number" value="${s.muatan || 0}" onchange="updateDataSLS(${idx}, 'muatan', this.value)" placeholder="Jml Muatan" style="background:#0f172a; border:1px solid var(--border); color:white; padding:8px; border-radius:8px; width:100%; text-align:center; font-size:0.85rem;">
            <button class="btn-delete" onclick="deleteDataSLS(${idx})" style="background: rgba(239, 68, 68, 0.1); color: var(--accent-red); border: none; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="bi bi-x-lg"></i></button>
        `;
                list.appendChild(row);
            });
        }

        function updateDataSLS(idx, field, val) {
            if (field === 'open' || field === 'muatan') val = parseInt(val) || 0;
            state.sls[idx][field] = val;
        }

        function addNewSLSRow() {
            state.sls.push({ kode: "NEW", nama: "", open: 0, submit: 0, reject: 0, pending: 0, approve: 0, muatan: 0 });
            renderDataSLSPage();
        }

        function deleteDataSLS(idx) {
            if (confirm('Hapus baris SLS ini?')) {
                state.sls.splice(idx, 1);
                renderDataSLSPage();
            }
        }

        function saveDataSLS() {
            syncConfigTargets();
            syncDashboardFromSLS();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            showAlert('Data Master SLS berhasil disimpan.');
            initForm();
            updateHeaderStats();
        }

        // ===============================
        // SETTINGS, BACKUP & RESTORE
        // ===============================
        function saveSettings() {
            state.apiKeys.openai = document.getElementById('api-openai').value.trim();
            state.apiKeys.gemini = document.getElementById('api-gemini').value.trim();
            state.apiKeys.mistral = document.getElementById('api-mistral').value.trim();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            updateApiStatusUI();
            showAlert('Konfigurasi API Key berhasil disimpan.');
        }

        function loadApiKeys() {
            document.getElementById('api-openai').value = state.apiKeys.openai || '';
            document.getElementById('api-gemini').value = state.apiKeys.gemini || '';
            document.getElementById('api-mistral').value = state.apiKeys.mistral || '';
            updateApiStatusUI();
        }

        function updateApiStatusUI() {
            ['openai', 'gemini', 'mistral'].forEach(key => {
                const hasKey = !!state.apiKeys[key];
                const dot = document.getElementById('status-' + key).querySelector('.status-dot');
                const text = document.getElementById('status-' + key);
                dot.className = 'status-dot ' + (hasKey ? 'active' : '');
                text.innerHTML = '<span class="status-dot ' + (hasKey ? 'active' : '') + '"></span> ' + (hasKey ? '<i class="bi bi-check-circle-fill"></i> Terkonfigurasi' : '<i class="bi bi-x-circle-fill"></i> Belum dikonfigurasi');
            });
        }

        async function testAllApis() {
            const resultsDiv = document.getElementById('test-results');
            resultsDiv.innerHTML = '<i class="bi bi-arrow-repeat"></i> Menguji koneksi...';
            let output = '';
            const tests = [
                { name: 'OpenAI', key: state.apiKeys.openai, url: 'https://api.openai.com/v1/models', auth: 'Bearer ' + state.apiKeys.openai },
                { name: 'Gemini', key: state.apiKeys.gemini, url: 'https://generativelanguage.googleapis.com/v1beta/models?key=' + state.apiKeys.gemini, auth: null },
                { name: 'Mistral', key: state.apiKeys.mistral, url: 'https://api.mistral.ai/v1/models', auth: 'Bearer ' + state.apiKeys.mistral }
            ];
            for (const t of tests) {
                if (!t.key) { output += '<div><i class="bi bi-x-circle"></i> ' + t.name + ': API Key kosong</div>'; continue; }
                try {
                    const headers = t.auth ? { 'Authorization': t.auth } : {};
                    const res = await fetch(t.url, { headers, signal: AbortSignal.timeout(5000) });
                    if (res.ok) output += '<div style="color:var(--accent-green)"><i class="bi bi-check-circle-fill"></i> ' + t.name + ': Terhubung</div>';
                    else output += '<div style="color:var(--accent-red)"><i class="bi bi-x-circle"></i> ' + t.name + ': Gagal (' + res.status + ')</div>';
                } catch (e) { output += '<div style="color:var(--accent-red)"><i class="bi bi-x-circle"></i> ' + t.name + ': ' + e.message + '</div>'; }
            }
            resultsDiv.innerHTML = output;
        }

        function backupData() {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "saka_tracker_backup_" + new Date().toISOString().slice(0, 10) + ".json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        }

        function restoreData(inputElement) {
            const file = inputElement.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const restoredState = JSON.parse(e.target.result);
                    if (restoredState.sls && restoredState.apiKeys) {
                        state = restoredState;
                        if (!state.consent) state.consent = { accepted: false, version: null, date: null };
                        if (!state.security) state.security = { pinEnabled: false, pinHash: null, recoveryHash: null, failedAttempts: 0, lockUntil: null };
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                        showAlert('Data berhasil dipulihkan.');
                        location.reload();
                    } else {
                        showAlert('File backup tidak valid.');
                    }
                } catch (err) {
                    showAlert('Gagal membaca file: ' + err.message);
                }
            };
            reader.readAsText(file);
        }

        // ===============================
        // LEGAL MODALS
        // ===============================
        function openModal(type) {
            const modal = document.getElementById('legal-modal');
            const title = document.getElementById('modal-title');
            const body = document.getElementById('modal-body');
            modal.style.display = 'flex';
            if (type === 'tos') {
                title.innerHTML = '<i class="bi bi-shield-check"></i> Terms of Service';
                body.innerHTML = `
            <span class="legal-updated">Terakhir diperbarui: 8 Juli 2026 &middot; Versi 5.6.0</span>
            <div class="legal-note"><i class="bi bi-info-circle-fill"></i> Saka Tracker adalah <strong>alat bantu internal</strong> untuk monitoring progres lapangan Sensus Ekonomi 2026 (SE2026). Aplikasi ini <strong>bukan produk resmi BPS</strong>.</div>
            <h4><i class="bi bi-1-circle-fill"></i> Penerimaan Ketentuan</h4>
            <p>Dengan mengakses dan menggunakan Saka Tracker, Anda menyatakan telah membaca, memahami, dan menyetujui seluruh ketentuan dalam dokumen ini.</p>
            <h4><i class="bi bi-2-circle-fill"></i> Deskripsi Layanan</h4>
            <p>Saka Tracker menyediakan fitur pencatatan progres SLS, perhitungan target & forecast, prioritisasi kerja, serta ringkasan analisis berbasis AI.</p>
            <h4><i class="bi bi-3-circle-fill"></i> Tanggung Jawab Pengguna</h4>
            <ul>
                <li>Anda bertanggung jawab penuh atas keakuratan data yang diinput.</li>
                <li>Jaga kerahasiaan API key pihak ketiga yang Anda masukkan.</li>
                <li><strong>Dilarang</strong> memasukkan data pribadi responden sensus ke aplikasi ini.</li>
            </ul>
            <h4><i class="bi bi-4-circle-fill"></i> Layanan Pihak Ketiga (AI Provider)</h4>
            <p>Fitur AI Insight bersifat opsional dan hanya aktif jika Anda mengisi API key sendiri. Penggunaan tunduk pada ketentuan masing-masing provider.</p>
            <h4><i class="bi bi-5-circle-fill"></i> Tanpa Jaminan (No Warranty)</h4>
            <p>Aplikasi disediakan "SEBAGAIMANA ADANYA" (AS IS) tanpa jaminan dalam bentuk apa pun.</p>
            <h4><i class="bi bi-6-circle-fill"></i> Batasan Tanggung Jawab</h4>
            <p>Pengembang tidak bertanggung jawab atas kehilangan data akibat penghapusan cache browser atau penggantian perangkat.</p>
            <h4><i class="bi bi-envelope-fill"></i> Kontak</h4>
            <p>Pertanyaan dapat disampaikan ke <strong>mlevian@protonmail.com</strong> atau WhatsApp developer.</p>
        `;
            } else if (type === 'privacy') {
                title.innerHTML = '<i class="bi bi-lock-fill"></i> Privacy Policy';
                body.innerHTML = `
            <span class="legal-updated">Terakhir diperbarui: 8 Juli 2026 &middot; Versi 5.6.0</span>
            <div class="legal-note"><i class="bi bi-hdd-fill"></i> Saka Tracker bersifat <strong>local-first</strong>: tidak ada server backend yang menyimpan data Anda.</div>
            <h4><i class="bi bi-1-circle-fill"></i> Data yang Diproses</h4>
            <p>Aplikasi menyimpan data berikut secara lokal di localStorage:</p>
            <ul>
                <li>Angka progres per SLS: open, submit, reject, pending, approve, dan draft.</li>
                <li>Riwayat snapshot harian (history).</li>
                <li>API key pihak ketiga (jika Anda mengisinya).</li>
            </ul>
            <h4><i class="bi bi-2-circle-fill"></i> Penyimpanan Lokal</h4>
            <p>Data tersimpan di localStorage browser. Tidak otomatis tersinkronisasi ke perangkat lain.</p>
            <h4><i class="bi bi-3-circle-fill"></i> Pengiriman Data ke Provider AI</h4>
            <p>Fitur AI Insight bersifat opsional. Saat digunakan, ringkasan angka agregat dikirim langsung ke provider AI.</p>
            <h4><i class="bi bi-4-circle-fill"></i> API Key</h4>
            <p>API key disimpan di localStorage dan digunakan hanya untuk memanggil layanan AI terkait.</p>
            <h4><i class="bi bi-5-circle-fill"></i> Hak Anda atas Data</h4>
            <ul>
                <li><strong>Export</strong>: unduh seluruh data melalui Backup.</li>
                <li><strong>Hapus</strong>: hapus history atau seluruh data.</li>
                <li><strong>Portabilitas</strong>: file backup JSON dapat dipindahkan ke perangkat lain.</li>
            </ul>
            <h4><i class="bi bi-envelope-fill"></i> Kontak</h4>
            <p>Pertanyaan dapat disampaikan ke <strong>mlevian@protonmail.com</strong> atau WhatsApp developer.</p>
        `;
            }
        }

        function closeModal() {
            document.getElementById('legal-modal').style.display = 'none';
        }

        // ===============================
        // HYBRID AI ORCHESTRATOR
        // ===============================
        class HybridAIOrchestrator {
            constructor(keys) {
                this.keys = keys;
                this.activeProvider = null;
                this.providers = [
                    { name: 'OpenAI', key: keys.openai, endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
                    { name: 'Gemini', key: keys.gemini, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', model: 'gemini-2.0-flash' },
                    { name: 'Mistral', key: keys.mistral, endpoint: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest' }
                ];
            }

            async generateInsight(prompt) {
                for (const provider of this.providers) {
                    if (!provider.key) continue;
                    try {
                        this.updateStatus(provider.name, 'calling');
                        const response = await this.callProvider(provider, prompt);
                        this.activeProvider = provider.name;
                        this.updateStatus(provider.name, 'active');
                        return this.cleanMarkdown(response);
                    } catch (err) {
                        console.warn(provider.name + ' failed:', err.message);
                        this.updateStatus(provider.name, 'error');
                        continue;
                    }
                }
                this.activeProvider = 'Deterministic Fallback';
                this.updateStatus('Fallback', 'active');
                return this.deterministicFallback();
            }

            async callProvider(provider, prompt) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 12000);
                let body, headers;
                if (provider.name === 'Gemini') {
                    body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
                    headers = { 'Content-Type': 'application/json', 'x-goog-api-key': provider.key };
                } else {
                    body = JSON.stringify({ model: provider.model, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 500 });
                    headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.key };
                }
                const res = await fetch(provider.endpoint, { method: 'POST', headers, body, signal: controller.signal });
                clearTimeout(timeoutId);
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    const err = new Error(errData.error?.message || 'HTTP ' + res.status);
                    err.status = res.status; throw err;
                }
                const data = await res.json();
                if (provider.name === 'Gemini') return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                return data.choices?.[0]?.message?.content || '';
            }

            cleanMarkdown(text) {
                if (!text) return '';
                // Let the cleanAIResponse function handle formatting
                return text;
            }

            deterministicFallback() {
                const prog = getProgress();
                const sisaHari = getSisaHariKeClearance();
                const remaining = state.config.assessment - prog.val;
                const reqVel = Math.ceil(remaining / Math.max(1, sisaHari));
                const currVel = getVelocity();
                const isOnTrack = currVel >= reqVel;
                const top3 = prioritasSLS().slice(0, 3).map(s => s.kode + ' (' + s.open + ' open)').join(', ');
                const statusTag = isOnTrack ? '<span class="ai-success"><i class="bi bi-check-circle-fill"></i> ON TRACK</span>' : '<span class="ai-warn"><i class="bi bi-exclamation-triangle-fill"></i> AT RISK</span>';
                if (currVel === 0) {
                    return '<p>' + statusTag + ': Belum ada data progres yang tercatat.</p><p><i class="bi bi-pin-angle-fill"></i> Mulai input data harian untuk mendapatkan analisis yang akurat.</p><p>Target clearance: <strong>' + clearanceDate.toLocaleDateString('id-ID') + '</strong></p>';
                }
                return '<h4>Status Saat Ini</h4><p>' + statusTag + ': Ritme saat ini <strong>' + currVel + ' data/hari</strong> ' + (isOnTrack ? 'memenuhi' : 'belum memenuhi') + ' target clearance.</p><p>Sisa data: <strong>' + remaining + '</strong>. Kebutuhan harian: <strong>' + reqVel + ' data</strong>.</p><h4>Prioritas</h4><p>Fokus prioritas: <span class="ai-highlight">' + top3 + '</span>.</p>' + (!isOnTrack ? '<h4>Rekomendasi</h4><p><i class="bi bi-lightbulb-fill"></i> Percepat approval di SLS prioritas dan evaluasi bottleneck harian.</p>' : '');
            }

            updateStatus(name, status) {
                const el = document.getElementById('ai-provider-status');
                let statusText = '<i class="bi bi-circle-fill" style="color:var(--accent-green); font-size:0.6rem;"></i>';
                if (status === 'calling') statusText = '<i class="bi bi-arrow-repeat"></i>';
                else if (status === 'error') statusText = '<i class="bi bi-circle-fill" style="color:var(--accent-red); font-size:0.6rem;"></i>';
                else if (status === 'active') statusText = '<i class="bi bi-circle-fill" style="color:var(--accent-green); font-size:0.6rem;"></i>';
                el.innerHTML = 'Multi-AI Orchestrator | Provider: <span class="provider-active">' + statusText + ' ' + name + '</span>';
            }
        }

        // ===============================
        // CONSENT GATE & PIN LOCK
        // ===============================
        function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

        async function sha256Hex(text) {
            const enc = new TextEncoder().encode(text);
            const buf = await crypto.subtle.digest('SHA-256', enc);
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        function checkConsentGate() {
            const gate = document.getElementById('consent-gate');
            const needsConsent = !state.consent || state.consent.version !== LEGAL_VERSION || !state.consent.accepted;
            if (needsConsent) {
                gate.style.display = 'flex';
                document.getElementById('consent-checkbox').checked = false;
                document.getElementById('btn-consent-agree').disabled = true;
            } else {
                gate.style.display = 'none';
                checkPinLock();
            }
        }

        function acceptConsent() {
            state.consent = { accepted: true, version: LEGAL_VERSION, date: new Date().toISOString() };
            saveState();
            document.getElementById('consent-gate').style.display = 'none';
            checkPinLock();
        }

        let pinBuffer = '';

        function checkPinLock() {
            const lock = document.getElementById('pin-lock-screen');
            if (state.security && state.security.pinEnabled) {
                lock.style.display = 'flex';
                pinBuffer = '';
                updatePinDots();
                document.getElementById('recovery-flow').style.display = 'none';
                document.getElementById('pin-error').innerText = '';
            } else {
                lock.style.display = 'none';
            }
        }

        function lockAppNow() {
            if (!state.security.pinEnabled) { showAlert('Aktifkan PIN terlebih dahulu.'); return; }
            document.getElementById('pin-lock-screen').style.display = 'flex';
            pinBuffer = '';
            updatePinDots();
        }

        function updatePinDots() {
            document.querySelectorAll('#pin-dots span').forEach((d, i) => d.classList.toggle('filled', i < pinBuffer.length));
        }

        function pinPress(digit) {
            if (pinBuffer.length >= 4) return;
            pinBuffer += digit;
            updatePinDots();
            if (pinBuffer.length === 4) setTimeout(verifyPin, 150);
        }

        function pinBackspace() {
            pinBuffer = pinBuffer.slice(0, -1);
            updatePinDots();
            document.getElementById('pin-error').innerText = '';
        }

        async function verifyPin() {
            const now = Date.now();
            if (state.security.lockUntil && now < state.security.lockUntil) {
                const secs = Math.ceil((state.security.lockUntil - now) / 1000);
                document.getElementById('pin-error').innerText = 'Terlalu banyak percobaan. Coba lagi dalam ' + secs + ' detik.';
                pinBuffer = ''; updatePinDots();
                return;
            }
            const hash = await sha256Hex(pinBuffer);
            if (hash === state.security.pinHash) {
                state.security.failedAttempts = 0;
                state.security.lockUntil = null;
                saveState();
                document.getElementById('pin-lock-screen').style.display = 'none';
                document.getElementById('pin-error').innerText = '';
            } else {
                state.security.failedAttempts = (state.security.failedAttempts || 0) + 1;
                if (state.security.failedAttempts >= 5) {
                    state.security.lockUntil = now + 30000;
                    state.security.failedAttempts = 0;
                    document.getElementById('pin-error').innerText = 'Terlalu banyak percobaan salah. Coba lagi dalam 30 detik.';
                } else {
                    document.getElementById('pin-error').innerText = 'PIN salah. Sisa percobaan: ' + (5 - state.security.failedAttempts);
                }
                saveState();
                pinBuffer = '';
                updatePinDots();
            }
        }

        function showRecoveryFlow() {
            document.getElementById('recovery-flow').style.display = 'block';
        }

        async function verifyRecovery() {
            const ans = document.getElementById('recovery-answer-input').value.trim().toLowerCase();
            const msg = document.getElementById('recovery-msg');
            if (!ans) { msg.style.color = 'var(--accent-red)'; msg.innerText = 'Isi jawaban pemulihan terlebih dahulu.'; return; }
            if (!state.security.recoveryHash) {
                msg.style.color = 'var(--accent-red)';
                msg.innerText = 'Belum ada jawaban pemulihan tersimpan. Reset hanya bisa lewat hapus data browser.';
                return;
            }
            const hash = await sha256Hex(ans);
            if (hash === state.security.recoveryHash) {
                state.security.pinEnabled = false;
                state.security.pinHash = null;
                state.security.failedAttempts = 0;
                state.security.lockUntil = null;
                saveState();
                document.getElementById('pin-lock-screen').style.display = 'none';
                showAlert('PIN berhasil direset. Silakan atur PIN baru di halaman Pengaturan.');
                switchPage('settings');
                updatePinSecurityUI();
            } else {
                msg.style.color = 'var(--accent-red)';
                msg.innerText = 'Jawaban tidak cocok. Coba lagi.';
            }
        }

        async function setupPin() {
            const pin = document.getElementById('pin-new').value.trim();
            const confirmPin = document.getElementById('pin-confirm').value.trim();
            const recovery = document.getElementById('pin-recovery').value.trim();
            if (!/^\d{4}$/.test(pin)) { showAlert('PIN harus tepat 4 digit angka.'); return; }
            if (pin !== confirmPin) { showAlert('Konfirmasi PIN tidak cocok.'); return; }
            if (!recovery || recovery.length < 3) { showAlert('Isi jawaban pemulihan minimal 3 karakter.'); return; }
            state.security.pinHash = await sha256Hex(pin);
            state.security.recoveryHash = await sha256Hex(recovery.toLowerCase());
            state.security.pinEnabled = true;
            state.security.failedAttempts = 0;
            state.security.lockUntil = null;
            saveState();
            document.getElementById('pin-new').value = '';
            document.getElementById('pin-confirm').value = '';
            document.getElementById('pin-recovery').value = '';
            updatePinSecurityUI();
            showAlert('PIN Lock berhasil diaktifkan.');
        }

        function disablePin() {
            if (!confirm('Nonaktifkan PIN Lock?')) return;
            state.security = { pinEnabled: false, pinHash: null, recoveryHash: null, failedAttempts: 0, lockUntil: null };
            saveState();
            updatePinSecurityUI();
        }

        function updatePinSecurityUI() {
            const statusDisplay = document.getElementById('pin-status-display');
            const lockBtn = document.getElementById('btn-lock-now');
            const disableBtn = document.getElementById('btn-disable-pin');
            if (state.security.pinEnabled) {
                statusDisplay.innerHTML = '<span class="status-dot active"></span> PIN Lock: Aktif';
                lockBtn.style.display = 'flex';
                disableBtn.style.display = 'flex';
            } else {
                statusDisplay.innerHTML = '<span class="status-dot"></span> PIN Lock: Nonaktif';
                lockBtn.style.display = 'none';
                disableBtn.style.display = 'none';
            }
        }
        // ===============================
        // PWA INSTALL PROMPT
        // ===============================
        let deferredPrompt;

        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault();
            // Stash the event so it can be triggered later
            deferredPrompt = e;
            // Show install banner
            const banner = document.getElementById('install-banner');
            if (banner) banner.classList.add('show');
        });

        document.getElementById('btn-install')?.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to install: ${outcome}`);
            // Hide banner after install
            if (outcome === 'accepted') {
                document.getElementById('install-banner').classList.remove('show');
            }
            deferredPrompt = null;
        });

        // Hide banner when app is already installed
        window.addEventListener('appinstalled', () => {
            document.getElementById('install-banner').classList.remove('show');
            console.log('[PWA] Saka Tracker installed as PWA');
        });
        // ===============================
        // INITIALIZATION
        // ===============================
        function initForm() {
            syncConfigTargets();
            syncDashboardFromSLS();
            updateHeaderStats();

            const checkbox = document.getElementById('mode-akumulasi');
            if (checkbox) {
                checkbox.checked = state.isAccumulationMode;
                const dateDisplay = document.getElementById('date-range-display');
                const toggleLabel = document.querySelector('.toggle-label');
                if (state.isAccumulationMode) {
                    toggleLabel.innerHTML = '<i class="bi bi-calendar-range"></i> Mode Akumulasi (Rentang Tanggal)';
                    if (dateDisplay) dateDisplay.style.display = "block";
                } else {
                    toggleLabel.innerHTML = '<i class="bi bi-calendar-event"></i> Mode Input Harian';
                    if (dateDisplay) dateDisplay.style.display = "none";
                }
            }

            const container = document.getElementById('sls-inputs-container');
            if (!container) return;
            container.innerHTML = '';
            state.sls.forEach((s, idx) => {
                const row = document.createElement('div');
                row.className = 'input-row';
                row.style.display = 'contents';
                row.innerHTML = `
            <div class="sls-code">${s.kode}</div>
            <input type="number" value="${s.open}" onchange="updateSLS(${idx},'open',this.value)">
            <input type="number" value="${s.submit}" onchange="updateSLS(${idx},'submit',this.value)">
            <input type="number" value="${s.reject}" onchange="updateSLS(${idx},'reject',this.value)">
            <input type="number" value="${s.pending}" onchange="updateSLS(${idx},'pending',this.value)">
            <input type="number" value="${s.approve}" onchange="updateSLS(${idx},'approve',this.value)">
        `;
                container.appendChild(row);
            });

            const dateEl = document.getElementById('current-date');
            if (dateEl) dateEl.innerText = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }

        window.addEventListener('DOMContentLoaded', function () {
            setTimeout(function () {
                initForm();
                loadApiKeys();
                renderHistory();
                updatePinSecurityUI();
                checkConsentGate();
                if (window.initFormGearDemo) window.initFormGearDemo();
            }, 100);
        });
    