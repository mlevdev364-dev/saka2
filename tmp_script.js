        /**
         * FormGear v2.0 Integration - Fungsi dan event handlers
         */

        let currentFormGearForm = 'demo-kegiatan';
        let formGearFirebaseManager = null;

        // Handle form selection change
        function handleFormChange(formId) {
            currentFormGearForm = formId;
            renderFormGear(formId);
        }

        // Render form ke container
        function renderFormGear(formId) {
            const container = document.getElementById('formgear-container');
            if (!container) return;

            window.FormGearBuilderInstance.renderForm(formId, 'formgear-container');
            loadSubmittedForms();
        }

        // Load dan tampilkan form yang sudah terkirim
        function loadSubmittedForms() {
            const gallery = document.getElementById('formgear-gallery');
            const emptyState = document.getElementById('formgear-empty-state');
            
            if (!gallery) return;

            const savedForms = JSON.parse(localStorage.getItem('formgear_submissions') || '[]');
            const currentFormSubmissions = savedForms.filter(f => f.formId === currentFormGearForm);

            if (currentFormSubmissions.length === 0) {
                gallery.innerHTML = '';
                emptyState.style.display = 'flex';
                document.getElementById('local-submissions-count').textContent = '0';
                return;
            }

            emptyState.style.display = 'none';
            gallery.innerHTML = currentFormSubmissions.map((submission, idx) => `
                <div class="form-card">
                    <div class="form-card-header">
                        <div class="form-card-title">${submission.formId.replace('demo-', '').toUpperCase()}</div>
                        <div class="form-card-status">
                            <i class="bi bi-check-circle"></i> 
                            ${submission.status === 'submitted' ? 'Terkirim' : 'Tersimpan'}
                        </div>
                    </div>
                    <div class="form-card-date">
                        ${new Date(submission.timestamp).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </div>
                    <div class="form-card-actions">
                        <button class="form-card-action-btn" onclick="viewFormData(${idx})">
                            <i class="bi bi-eye"></i> Lihat
                        </button>
                        <button class="form-card-action-btn" onclick="uploadSingleForm(${idx})">
                            <i class="bi bi-cloud-upload"></i> Upload
                        </button>
                        <button class="form-card-action-btn delete" onclick="deleteFormData(${idx})">
                            <i class="bi bi-trash3"></i> Hapus
                        </button>
                    </div>
                </div>
            `).join('');

            document.getElementById('local-submissions-count').textContent = currentFormSubmissions.length;
        }

        // View form data
        function viewFormData(idx) {
            const savedForms = JSON.parse(localStorage.getItem('formgear_submissions') || '[]');
            const currentFormSubmissions = savedForms.filter(f => f.formId === currentFormGearForm);
            const formData = currentFormSubmissions[idx];

            if (!formData) return;

            let dataHtml = '<table style="width:100%; font-size: 0.8rem; border-collapse: collapse;">';
            Object.entries(formData.data).forEach(([key, value]) => {
                const displayValue = Array.isArray(value) ? value.join(', ') : value;
                dataHtml += `
                    <tr style="border-bottom: 1px solid var(--border);">
                        <td style="padding: 8px; font-weight: 600; width: 30%; color: var(--accent-blue);">${key}</td>
                        <td style="padding: 8px;">${displayValue || '-'}</td>
                    </tr>
                `;
            });
            dataHtml += '</table>';

            showAlert('Data Form:\n\n' + JSON.stringify(formData.data, null, 2));
        }

        // Upload single form ke Firebase
        async function uploadSingleForm(idx) {
            if (!formGearFirebaseManager || !formGearFirebaseManager.initialized) {
                showAlert('Firebase belum siap. Coba lagi dalam beberapa detik.');
                return;
            }

            const savedForms = JSON.parse(localStorage.getItem('formgear_submissions') || '[]');
            const currentFormSubmissions = savedForms.filter(f => f.formId === currentFormGearForm);
            const formData = currentFormSubmissions[idx];

            if (!formData) return;

            try {
                const result = await formGearFirebaseManager.uploadFormData(
                    formData.formId,
                    formData.data
                );
                alert(`Form berhasil diunggah ke Firebase!\nID: ${result.id}`);
                loadSubmittedForms();
                updateFirebaseSubmissionCount();
            } catch (error) {
                alert(`Gagal mengunggah: ${error.message}`);
            }
        }

        // Delete form data
        function deleteFormData(idx) {
            if (!confirm('Hapus form ini?')) return;

            const savedForms = JSON.parse(localStorage.getItem('formgear_submissions') || '[]');
            const currentFormIdx = savedForms.findIndex(f => f.formId === currentFormGearForm);
            
            let currentCount = 0;
            const newSavedForms = savedForms.filter((form, i) => {
                if (form.formId === currentFormGearForm) {
                    if (currentCount === idx) {
                        currentCount++;
                        return false;
                    }
                    currentCount++;
                }
                return true;
            });

            localStorage.setItem('formgear_submissions', JSON.stringify(newSavedForms));
            loadSubmittedForms();
        }

        // Sinkronkan semua form lokal ke Firebase
        async function syncFormToFirebase() {
            if (!formGearFirebaseManager || !formGearFirebaseManager.initialized) {
                alert('Firebase belum siap. Coba lagi dalam beberapa detik.');
                return;
            }

            const savedForms = JSON.parse(localStorage.getItem('formgear_submissions') || '[]');
            
            if (savedForms.length === 0) {
                alert('Tidak ada form untuk disinkronkan');
                return;
            }

            const btn = event.target;
            btn.disabled = true;
            btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Menyinkronkan...';

            try {
                let successCount = 0;
                for (const formData of savedForms) {
                    try {
                        await formGearFirebaseManager.uploadFormData(
                            formData.formId,
                            formData.data
                        );
                        successCount++;
                    } catch (error) {
                        console.error(`Gagal upload form ${formData.formId}:`, error);
                    }
                }

                alert(`Sinkronisasi selesai: ${successCount}/${savedForms.length} form berhasil diunggah`);
                loadSubmittedForms();
                updateFirebaseSubmissionCount();
            } catch (error) {
                alert(`Sinkronisasi gagal: ${error.message}`);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-cloud-upload"></i> Sinkronkan Semua ke Firebase';
            }
        }

        // Update Firebase submission count
        async function updateFirebaseSubmissionCount() {
            if (!formGearFirebaseManager || !formGearFirebaseManager.initialized) return;

            try {
                const submissions = await formGearFirebaseManager.getFormSubmissions(currentFormGearForm);
                document.getElementById('firebase-submissions-count').textContent = submissions.length;
            } catch (error) {
                console.error('Error fetching Firebase submissions:', error);
            }
        }

        // Update Firebase status display
        function updateFirebaseStatus() {
            const statusEl = document.getElementById('firebase-status');
            if (!statusEl) return;

            if (formGearFirebaseManager && formGearFirebaseManager.initialized) {
                statusEl.innerHTML = `
                    <span class="status-dot active"></span> 
                    Firebase Connected - Project: formgear
                `;
                statusEl.style.color = 'var(--accent-green)';
            } else {
                statusEl.innerHTML = `
                    <span class="status-dot"></span> 
                    Initializing Firebase...
                `;
            }
        }

        // Initialize FormGear v2
        function initializeFormGearV2() {
            // Inisialisasi Firebase Manager
            formGearFirebaseManager = new FormGearFirebaseManager();
            
            // Tunggu Firebase siap
            const checkFirebase = setInterval(() => {
                if (formGearFirebaseManager.initialized) {
                    clearInterval(checkFirebase);
                    updateFirebaseStatus();
                    updateFirebaseSubmissionCount();
                }
            }, 500);

            // Render form awal
            setTimeout(() => {
                renderFormGear('demo-kegiatan');
                loadFormDefinitions(); // Load form definitions from Firebase
            }, 100);
        }

        // Load and display form definitions as cards
        function loadFormDefinitions() {
            const gallery = document.getElementById('form-definitions-gallery');
            if (!gallery) return;

            const localDefs = JSON.parse(localStorage.getItem('formgear_form_definitions') || '[]');

            const renderGallery = (forms) => {
                if (forms.length === 0) {
                    gallery.innerHTML = `
                        <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 30px;">
                            <i class="bi bi-inbox" style="font-size: 2rem; display: block; margin-bottom: 10px;"></i>
                            <p>Belum ada form. <button class="btn-outline" onclick="switchPage('formbuilder')" style="color: var(--accent-blue); text-decoration: none; border:none; background:transparent; padding:0; font-size:0.85rem;">Buat form baru di Form Builder</button></p>
                        </div>
                    `;
                    return;
                }

                gallery.innerHTML = forms.map(form => {
                    const fieldCount = form.sections?.reduce((count, s) => count + (s.fields?.length || 0), 0) || 0;
                    const createdDate = new Date(form.createdAt || Date.now()).toLocaleDateString('id-ID');
                    const sourceLabel = form.source === 'local' ? 'Lokal' : 'Firebase';

                    return `
                        <div style="background: #0f172a; border: 1px solid var(--border); border-radius: 10px; padding: 16px; transition: all 0.3s;">
                            <div style="font-weight: 600; color: var(--text-main); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: start; gap:10px; flex-wrap:wrap;">
                                <span style="flex: 1; word-break: break-word;">${form.name || 'Unnamed Form'}</span>
                                <span style="background: var(--accent-blue); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap;">${fieldCount} field</span>
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;">${form.description || '-'}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 12px; display: flex; gap: 16px; flex-wrap:wrap;">
                                <span>📅 ${createdDate}</span>
                                <span>📂 ${form.category || 'Uncategorized'}</span>
                                <span>${sourceLabel}</span>
                            </div>
                            <div style="display: flex; gap: 8px; flex-wrap:wrap;">
                                <button onclick="switchPage('formbuilder'); setTimeout(() => selectBuilderTemplate('${form.id}'), 100);" style="flex: 1; min-width: 120px; padding: 8px; background: var(--accent-blue); color: white; border: none; border-radius: 6px; text-align: center; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: background 0.3s;" onmouseover="this.style.background='var(--accent-purple)'" onmouseout="this.style.background='var(--accent-blue)'">
                                    ✏️ Edit
                                </button>
                                <button onclick="deleteFormDefinition('${form.id}')" style="flex: 1; min-width: 120px; padding: 8px; background: #c53030; color: white; border: none; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: background 0.3s;" onmouseover="this.style.background='#9b2c2c'" onmouseout="this.style.background='#c53030'">
                                    🗑️ Hapus
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            };

            const renderLocalAndRemote = (remoteForms = []) => {
                const merged = [
                    ...localDefs.map(f => ({ ...f, source: 'local' })),
                    ...remoteForms.filter(remote => !localDefs.some(local => local.id === remote.id)).map(f => ({ ...f, source: 'firebase' }))
                ];
                renderGallery(merged);
            };

            try {
                if (window.firebase && firebase.database) {
                    const formGearDb = firebase.database();
                    formGearDb.ref('forms').on('value', (snapshot) => {
                        const remoteForms = [];
                        if (snapshot.exists()) {
                            const data = snapshot.val();
                            Object.keys(data).forEach(formId => {
                                remoteForms.push({ id: formId, ...data[formId] });
                            });
                        }
                        renderLocalAndRemote(remoteForms);
                    });
                } else {
                    renderLocalAndRemote([]);
                }
            } catch (error) {
                console.error('Error loading form definitions:', error);
                renderLocalAndRemote([]);
            }
        }


        // Delete form definition
        function deleteFormDefinition(formId) {
            if (confirm('Yakin ingin menghapus form ini?')) {
                const firebaseConfig = {
                    apiKey: "AIzaSyCjyYMXZFhEZXn4JwL67LOxc6nZqszgyQQ",
                    authDomain: "formgear.firebaseapp.com",
                    databaseURL: "https://formgear-default-rtdb.asia-southeast1.firebasedatabase.app",
                    projectId: "formgear"
                };

                try {
                    firebase.database().ref(`forms/${formId}`).remove();
                    console.log('Form deleted:', formId);
                } catch (error) {
                    console.error('Error deleting form:', error);
                    alert('Error deleting form');
                }
            }
        }

        // Event listener saat FormGear page aktif
        window.addEventListener('DOMContentLoaded', () => {
            // Inisialisasi FormGear saat page load
            setTimeout(() => {
                initializeFormGearV2();
            }, 500);
        });

        // Update Firebase status setiap 5 detik
        setInterval(updateFirebaseStatus, 5000);