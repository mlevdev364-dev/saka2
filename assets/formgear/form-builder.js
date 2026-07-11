(function () {
  const STORAGE_FORM_DEFINITIONS = "formgear_form_definitions";
  const STORAGE_SUBMISSIONS = "formgear_submissions";

  class FormGearBuilder {
    constructor() {
      this.localDefinitions = this.loadLocalDefinitions();
      this.currentFormId = null;
      this.currentForm = null;
      this.initialized = false;
    }

    initFormGear() {
      if (this.initialized) return;
      this.initialized = true;
      this.currentFormId = this.getDefaultFormId();
      this.currentForm = this.getFormDefinition(this.currentFormId);
    }

    getDefaultFormId() {
      if (window.FormGearSampleForms && window.FormGearSampleForms.length) {
        return window.FormGearSampleForms[0].id;
      }
      return null;
    }

    loadLocalDefinitions() {
      try {
        return (
          JSON.parse(localStorage.getItem(STORAGE_FORM_DEFINITIONS) || "[]") ||
          []
        );
      } catch (error) {
        console.warn(
          "[FormGearBuilder] Gagal membaca definisi form lokal:",
          error,
        );
        return [];
      }
    }

    saveLocalDefinitions() {
      localStorage.setItem(
        STORAGE_FORM_DEFINITIONS,
        JSON.stringify(this.localDefinitions || []),
      );
    }

    getFormDefinition(formId) {
      const local = (this.localDefinitions || []).find(
        (def) => def.id === formId,
      );
      if (local) {
        return local;
      }

      if (
        window.FormGearSampleForms &&
        Array.isArray(window.FormGearSampleForms)
      ) {
        return (
          window.FormGearSampleForms.find((form) => form.id === formId) || null
        );
      }

      return null;
    }

    getAllFormDefinitions() {
      const sampleForms = Array.isArray(window.FormGearSampleForms)
        ? window.FormGearSampleForms
        : [];
      const localIds = (this.localDefinitions || []).map((def) => def.id);
      const merged = [...(this.localDefinitions || [])];
      sampleForms.forEach((sample) => {
        if (!localIds.includes(sample.id)) merged.push(sample);
      });
      return merged;
    }

    getTemplateById(templateId) {
      if (!window.FormGearTemplateCatalog) return null;
      return (
        window.FormGearTemplateCatalog.find(
          (template) => template.id === templateId,
        ) || null
      );
    }

    createNewField() {
      return {
        label: "Isian Baru",
        name: "field_" + Math.random().toString(36).substring(2, 8),
        type: "text",
        placeholder: "",
        options: [],
        children: [],
      };
    }

    createNewSection() {
      return {
        title: "Bagian Baru",
        description: "Deskripsi singkat bagian.",
        fields: [this.createNewField()],
      };
    }

    selectForm(formId) {
      const form = this.getFormDefinition(formId);
      if (!form) {
        showAlert("Form tidak ditemukan: " + formId);
        return;
      }
      this.currentFormId = formId;
      this.currentForm = JSON.parse(JSON.stringify(form));
      this.renderBuilderPage();
    }

    renderBuilderPage() {
      const controls = document.getElementById("form-builder-controls");
      const preview = document.getElementById("form-builder-preview");
      if (!controls || !preview) return;

      if (!this.currentForm) {
        this.initFormGear();
      }

      const selectedForm =
        this.currentForm || this.getFormDefinition(this.getDefaultFormId());
      const templates = Array.isArray(window.FormGearTemplateCatalog)
        ? window.FormGearTemplateCatalog
        : [];
      const templateOptions = templates
        .map(
          (template) => `
                <option value="${template.id}" ${selectedForm.templateId === template.id ? "selected" : ""}>
                    ${template.name}
                </option>
            `,
        )
        .join("");

      controls.innerHTML = `
                <div class="formgear-builder-toolbar">
                    <div style="flex:1; min-width:260px;">
                        <label>Template Form</label>
                        <select id="builder-template-selector" onchange="FormGearBuilderInstance.updateBuilderMeta('templateId', this.value)">
                            ${templateOptions}
                        </select>
                    </div>
                    <button class="btn-success" onclick="FormGearBuilderInstance.addBuilderSection()"><i class="bi bi-folder-plus"></i> Tambah Section</button>
                    <button class="btn-success" onclick="FormGearBuilderInstance.saveBuilderDefinition()"><i class="bi bi-save"></i> Simpan Definisi</button>
                    <button class="btn-outline" onclick="FormGearBuilderInstance.generateBuilderJson()"><i class="bi bi-code-slash"></i> Generate JSON</button>
                </div>
                <div class="formgear-builder-panel">
                    <div class="formgear-builder-row">
                        <div>
                            <label>Nama Form</label>
                            <input type="text" id="builder-form-name" value="${this.escapeHtml(selectedForm.name || "")}" onchange="FormGearBuilderInstance.updateBuilderMeta('name', this.value)">
                        </div>
                        <div>
                            <label>Kategori</label>
                            <input type="text" id="builder-form-category" value="${this.escapeHtml(selectedForm.category || "")}" onchange="FormGearBuilderInstance.updateBuilderMeta('category', this.value)">
                        </div>
                    </div>
                    <div class="formgear-builder-row">
                        <div style="grid-column:1/-1;">
                            <label>Deskripsi Form</label>
                            <textarea id="builder-form-description" onchange="FormGearBuilderInstance.updateBuilderMeta('description', this.value)">${this.escapeHtml(selectedForm.description || "")}</textarea>
                        </div>
                    </div>
                    <div id="builder-sections">${this.renderBuilderSections(selectedForm)}</div>
                </div>
                <div class="formgear-builder-panel">
                    <h4>JSON Output</h4>
                    <pre id="builder-json-output" class="formgear-json-output"></pre>
                </div>
            `;

      preview.innerHTML = this.renderFormPreview(selectedForm);
      this.generateBuilderJson();
    }

    renderBuilderSections(formDef) {
      if (!formDef || !Array.isArray(formDef.sections)) {
        return '<p style="color: var(--text-muted);">Tidak ada section.</p>';
      }
      return formDef.sections
        .map(
          (section, sectionIndex) => `
                <div class="formgear-builder-section" id="builder-section-${sectionIndex}">
                    <div class="section-header">
                        <strong class="section-title">Section ${sectionIndex + 1}</strong>
                        <button class="btn-danger" onclick="FormGearBuilderInstance.removeBuilderSection(${sectionIndex})"><i class="bi bi-trash3"></i> Hapus Section</button>
                    </div>
                    <div class="formgear-builder-row">
                        <div>
                            <label>Judul Section</label>
                            <input type="text" value="${this.escapeHtml(section.title || "")}" onchange="FormGearBuilderInstance.updateBuilderSection(${sectionIndex}, 'title', this.value)">
                        </div>
                        <div>
                            <label>Deskripsi Section</label>
                            <input type="text" value="${this.escapeHtml(section.description || "")}" onchange="FormGearBuilderInstance.updateBuilderSection(${sectionIndex}, 'description', this.value)">
                        </div>
                    </div>
                    ${this.renderBuilderFields(section, sectionIndex)}
                    <button class="btn-outline" onclick="FormGearBuilderInstance.addBuilderField(${sectionIndex})"><i class="bi bi-plus-lg"></i> Tambah Field</button>
                </div>
            `,
        )
        .join("");
    }

    renderBuilderFields(section, sectionIndex) {
      if (!section.fields || !section.fields.length) {
        return '<p style="color: var(--text-muted);">Belum ada field dalam section ini.</p>';
      }
      return section.fields
        .map((field, fieldIndex) =>
          this.renderBuilderField(sectionIndex, fieldIndex, field, 0),
        )
        .join("");
    }

    renderBuilderField(sectionIndex, fieldIndex, field, depth) {
      const indentStyle = depth > 0 ? "margin-left: " + depth * 12 + "px;" : "";
      const childFields = Array.isArray(field.children) ? field.children : [];
      const optionsHtml = (field.options || [])
        .map(
          (option) => `
                <option value="${this.escapeHtml(option)}" ${field.placeholder === option ? "selected" : ""}>${this.escapeHtml(option)}</option>
            `,
        )
        .join("");
      return `
                <div class="formgear-builder-field" style="${indentStyle}">
                    <div class="formgear-builder-row">
                        <div>
                            <label>Label Field</label>
                            <input type="text" value="${this.escapeHtml(field.label || "")}" onchange="FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${fieldIndex}', ${depth}, 'label', this.value)">
                        </div>
                        <div>
                            <label>Nama Kunci</label>
                            <input type="text" value="${this.escapeHtml(field.name || "")}" onchange="FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${fieldIndex}', ${depth}, 'name', this.value)">
                        </div>
                        <div>
                            <label>Tipe Field</label>
                            <select onchange="FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${fieldIndex}', ${depth}, 'type', this.value)">
                                <option value="text" ${field.type === "text" ? "selected" : ""}>Text</option>
                                <option value="number" ${field.type === "number" ? "selected" : ""}>Number</option>
                                <option value="textarea" ${field.type === "textarea" ? "selected" : ""}>Textarea</option>
                                <option value="select" ${field.type === "select" ? "selected" : ""}>Select</option>
                            </select>
                        </div>
                    </div>
                    <div class="formgear-builder-row">
                        <div style="grid-column: 1/-1;">
                            <label>Placeholder / Opsi</label>
                            <input type="text" value="${this.escapeHtml(field.placeholder || "")}" onchange="FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${fieldIndex}', ${depth}, 'placeholder', this.value)">
                            ${
                              field.type === "select"
                                ? `
                                <small style="color: var(--text-muted); display:block; margin-top:6px;">Masukkan opsi, pisahkan dengan koma.</small>
                            `
                                : ""
                            }
                        </div>
                    </div>
                    <div class="field-actions">
                        <button class="btn-outline" onclick="FormGearBuilderInstance.addBuilderChildField(${sectionIndex}, '${fieldIndex}', ${depth})"><i class="bi bi-arrow-return-right"></i> Tambah Child Field</button>
                        <button class="btn-danger" onclick="FormGearBuilderInstance.removeBuilderField(${sectionIndex}, '${fieldIndex}', ${depth})"><i class="bi bi-trash3"></i> Hapus Field</button>
                    </div>
                    ${childFields.map((child, childIndex) => this.renderBuilderField(sectionIndex, `${fieldIndex}-${childIndex}`, child, depth + 1)).join("")}
                </div>
            `;
    }

    updateBuilderMeta(key, value) {
      if (!this.currentForm) return;
      this.currentForm[key] = value;
      this.renderBuilderPage();
    }

    updateBuilderSection(sectionIndex, key, value) {
      if (
        !this.currentForm ||
        !this.currentForm.sections ||
        !this.currentForm.sections[sectionIndex]
      )
        return;
      this.currentForm.sections[sectionIndex][key] = value;
      this.renderBuilderPage();
    }

    updateBuilderField(sectionIndex, path, depth, key, value) {
      const field = this.getFieldByPath(sectionIndex, path, depth);
      if (!field) return;
      if (key === "placeholder" && field.type === "select") {
        field.options = value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      } else {
        field[key] = value;
      }
      this.renderBuilderPage();
    }

    getFieldByPath(sectionIndex, path, depth) {
      if (
        !this.currentForm ||
        !this.currentForm.sections ||
        !this.currentForm.sections[sectionIndex]
      )
        return null;
      const indices = String(path).split("-").map(Number);
      let field = this.currentForm.sections[sectionIndex].fields[indices[0]];
      for (let i = 1; i < indices.length; i += 1) {
        if (!field || !Array.isArray(field.children)) return null;
        field = field.children[indices[i]];
      }
      return field;
    }

    addBuilderSection() {
      if (!this.currentForm) return;
      this.currentForm.sections = this.currentForm.sections || [];
      this.currentForm.sections.push(this.createNewSection());
      this.renderBuilderPage();
    }

    removeBuilderSection(sectionIndex) {
      if (!this.currentForm || !this.currentForm.sections) return;
      this.currentForm.sections.splice(sectionIndex, 1);
      this.renderBuilderPage();
    }

    addBuilderField(sectionIndex) {
      if (!this.currentForm || !this.currentForm.sections) return;
      const section = this.currentForm.sections[sectionIndex];
      if (!section) return;
      section.fields = section.fields || [];
      section.fields.push(this.createNewField());
      this.renderBuilderPage();
    }

    removeBuilderField(sectionIndex, path, depth) {
      if (!this.currentForm) return;
      const indices = String(path).split("-").map(Number);
      if (indices.length === 1) {
        const section = this.currentForm.sections[sectionIndex];
        if (!section) return;
        section.fields.splice(indices[0], 1);
      } else {
        const parentPath = indices.slice(0, -1);
        const parent = this.getFieldByPath(
          sectionIndex,
          parentPath.join("-"),
          depth - 1,
        );
        if (!parent || !Array.isArray(parent.children)) return;
        parent.children.splice(indices[indices.length - 1], 1);
      }
      this.renderBuilderPage();
    }

    addBuilderChildField(sectionIndex, path, depth) {
      const field = this.getFieldByPath(sectionIndex, path, depth);
      if (!field) return;
      field.children = field.children || [];
      field.children.push(this.createNewField());
      this.renderBuilderPage();
    }

    generateBuilderJson() {
      const output = document.getElementById("builder-json-output");
      if (!output || !this.currentForm) return;
      output.textContent = JSON.stringify(this.currentForm, null, 2);
    }

    renderFormPreview(formDef) {
      const html = [`<div class="formgear-form-preview">`];
      html.push(`<h3>${this.escapeHtml(formDef.name || "Form Preview")}</h3>`);
      html.push(
        `<p style="color: var(--text-muted); margin: 0 0 16px;">${this.escapeHtml(formDef.description || "")}</p>`,
      );
      html.push(this.renderPreviewSections(formDef, 0));
      html.push(`</div>`);
      return html.join("");
    }

    renderPreviewSections(formDef, sectionIndex) {
      return (formDef.sections || [])
        .map(
          (section, idx) => `
                <div class="form-section-preview">
                    <h4 style="margin:0 0 8px; color: var(--accent-blue);">${this.escapeHtml(section.title || "Section")}</h4>
                    <p style="margin:0 0 12px; color: var(--text-muted);">${this.escapeHtml(section.description || "")}</p>
                    ${this.renderPreviewFields(section.fields || [], `${idx}`)}
                </div>
            `,
        )
        .join("");
    }

    renderPreviewFields(fields, pathPrefix) {
      return (fields || [])
        .map((field, fieldIndex) => {
          const path = `${pathPrefix}-${fieldIndex}`;
          return `
                    <div class="field-preview">
                        <label>${this.escapeHtml(field.label || "Field")}</label>
                        ${this.renderPreviewControl(field, path)}
                        ${field.children && field.children.length ? `<div class="formgear-builder-children">${this.renderPreviewFields(field.children, path)}</div>` : ""}
                    </div>
                `;
        })
        .join("");
    }

    renderPreviewControl(field, path) {
      const name = this.escapeHtml(field.name || "field_" + path);
      if (field.type === "textarea") {
        return `<textarea placeholder="${this.escapeHtml(field.placeholder || "")}" disabled></textarea>`;
      }
      if (field.type === "number") {
        return `<input type="number" placeholder="${this.escapeHtml(field.placeholder || "")}" disabled>`;
      }
      if (field.type === "select") {
        const options = Array.isArray(field.options) ? field.options : [];
        return `<select disabled>${options.map((option) => `<option>${this.escapeHtml(option)}</option>`).join("")}</select>`;
      }
      return `<input type="text" placeholder="${this.escapeHtml(field.placeholder || "")}" disabled>`;
    }

    renderForm(formId, containerId) {
      const formDef = this.getFormDefinition(formId);
      const container = document.getElementById(containerId);
      if (!container) return;
      if (!formDef) {
        container.innerHTML =
          '<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>Form tidak ditemukan.</p></div>';
        return;
      }
      container.innerHTML = this.renderFormContent(formDef);
    }

    renderFormContent(formDef) {
      const html = [`<div class="formgear-form-preview">`];
      html.push(`<h3>${this.escapeHtml(formDef.name || "Form")}</h3>`);
      html.push(
        `<p style="color: var(--text-muted); margin: 0 0 16px;">${this.escapeHtml(formDef.description || "")}</p>`,
      );
      html.push(this.renderFormFields(formDef, 0));
      html.push(
        `<button class="btn-success formgear-submit-button" onclick="FormGearBuilderInstance.submitRenderedForm('${formDef.id}')"><i class="bi bi-send"></i> Kirim Form</button>`,
      );
      html.push(`</div>`);
      return html.join("");
    }

    renderFormFields(formDef, sectionIndex) {
      return (formDef.sections || [])
        .map(
          (section, idx) => `
                <div class="form-section-preview">
                    <h4 style="margin:0 0 8px; color: var(--accent-blue);">${this.escapeHtml(section.title || "Section")}</h4>
                    <p style="margin:0 0 12px; color: var(--text-muted);">${this.escapeHtml(section.description || "")}</p>
                    ${this.renderFormFieldInputs(section.fields || [], `${idx}`)}
                </div>
            `,
        )
        .join("");
    }

    renderFormFieldInputs(fields, pathPrefix) {
      return (fields || [])
        .map((field, fieldIndex) => {
          const fieldPath = `${pathPrefix}-${fieldIndex}`;
          const name = this.escapeHtml(field.name || "field_" + fieldPath);
          let control = "";
          if (field.type === "textarea") {
            control = `<textarea data-field-name="${name}" data-field-path="${fieldPath}" placeholder="${this.escapeHtml(field.placeholder || "")}"></textarea>`;
          } else if (field.type === "number") {
            control = `<input type="number" data-field-name="${name}" data-field-path="${fieldPath}" placeholder="${this.escapeHtml(field.placeholder || "")}">`;
          } else if (field.type === "select") {
            const options = Array.isArray(field.options) ? field.options : [];
            control =
              `<select data-field-name="${name}" data-field-path="${fieldPath}">` +
              options
                .map(
                  (option) =>
                    `<option value="${this.escapeHtml(option)}">${this.escapeHtml(option)}</option>`,
                )
                .join("") +
              `</select>`;
          } else {
            control = `<input type="text" data-field-name="${name}" data-field-path="${fieldPath}" placeholder="${this.escapeHtml(field.placeholder || "")}">`;
          }
          return `
                    <div class="field-preview">
                        <label>${this.escapeHtml(field.label || "Field")}</label>
                        ${control}
                        ${field.children && field.children.length ? `<div class="formgear-builder-children">${this.renderFormFieldInputs(field.children, fieldPath)}</div>` : ""}
                    </div>
                `;
        })
        .join("");
    }

    submitRenderedForm(formId) {
      const formDef = this.getFormDefinition(formId);
      if (!formDef) return;
      const formContainer = document.getElementById("formgear-container");
      if (!formContainer) return;
      const fields = formContainer.querySelectorAll("[data-field-name]");
      const submission = {};
      fields.forEach((field) => {
        const fieldName = field.dataset.fieldName;
        let value = "";
        if (field.tagName === "SELECT") {
          value = field.value;
        } else if (field.type === "checkbox") {
          value = field.checked;
        } else {
          value = field.value;
        }
        if (submission[fieldName] !== undefined) {
          if (!Array.isArray(submission[fieldName])) {
            submission[fieldName] = [submission[fieldName]];
          }
          submission[fieldName].push(value);
        } else {
          submission[fieldName] = value;
        }
      });

      const savedForms = JSON.parse(
        localStorage.getItem(STORAGE_SUBMISSIONS) || "[]",
      );
      savedForms.push({
        formId,
        data: submission,
        status: "submitted",
        timestamp: Date.now(),
      });
      localStorage.setItem(STORAGE_SUBMISSIONS, JSON.stringify(savedForms));
      showAlert(
        "Form berhasil disimpan secara lokal. Anda dapat menyinkronkannya ke Firebase.",
      );
      if (typeof loadSubmittedForms === "function") {
        loadSubmittedForms();
      }
      return submission;
    }

    saveBuilderDefinition() {
      if (!this.currentForm) return;
      this.currentForm.id = this.currentForm.id || "form-" + Date.now();
      this.currentForm.createdAt = this.currentForm.createdAt || Date.now();
      const existingIndex = this.localDefinitions.findIndex(
        (def) => def.id === this.currentForm.id,
      );
      if (existingIndex >= 0) {
        this.localDefinitions[existingIndex] = JSON.parse(
          JSON.stringify(this.currentForm),
        );
      } else {
        this.localDefinitions.push(
          JSON.parse(JSON.stringify(this.currentForm)),
        );
      }
      this.saveLocalDefinitions();
      showAlert(
        "Definisi form berhasil disimpan. Anda dapat melihatnya di galeri FormGear.",
      );
      if (typeof loadFormDefinitions === "function") {
        loadFormDefinitions();
      }
      if (typeof updateFirebaseSubmissionCount === "function") {
        updateFirebaseSubmissionCount();
      }
    }

    escapeHtml(value) {
      if (value === null || value === undefined) return "";
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
  }

  window.FormGearBuilderInstance = new FormGearBuilder();
  window.initFormGearDemo = function () {
    window.FormGearBuilderInstance.initFormGear();
    initializeFormGearV2();
  };
  window.initFormBuilderPage = function () {
    window.FormGearBuilderInstance.initFormGear();
    window.FormGearBuilderInstance.renderBuilderPage();
  };
  window.initFormBuilder = window.initFormBuilderPage;
  window.createNewBuilderForm = function () {
    const instance = window.FormGearBuilderInstance;
    instance.currentForm = {
      id: 'form-' + Date.now(),
      name: '',
      category: '',
      description: '',
      createdAt: Date.now(),
      sections: [instance.createNewSection()],
    };
    instance.renderBuilderPage();
  };
  window.addBuilderSection = function () {
    window.FormGearBuilderInstance.addBuilderSection();
  };
  window.saveBuilderForm = function () {
    window.FormGearBuilderInstance.saveBuilderDefinition();
  };
  window.exportBuilderJson = function () {
    window.FormGearBuilderInstance.generateBuilderJson();
    const output = document.getElementById('builder-json-output');
    if (output) {
      output.focus();
      output.select?.();
    }
  };
  window.uploadBuilderDefinitionToFirebase = async function () {
    const instance = window.FormGearBuilderInstance;
    if (!window.formGearFirebaseManager || !window.formGearFirebaseManager.initialized) {
      showAlert('Firebase belum siap. Coba lagi dalam beberapa detik.');
      return;
    }
    if (!instance.currentForm) {
      showAlert('Tidak ada form builder yang dipilih.');
      return;
    }
    try {
      await window.formGearFirebaseManager.saveFormDefinition(instance.currentForm);
      showAlert('Definisi form berhasil diunggah ke Firebase.');
    } catch (error) {
      console.error(error);
      showAlert('Gagal mengunggah definisi: ' + error.message);
    }
  };
  window.submitBuilderPreview = function () {
    const instance = window.FormGearBuilderInstance;
    if (!instance.currentForm || !instance.currentForm.id) {
      showAlert('Tidak ada form preview yang dapat disimpan.');
      return;
    }
    instance.submitRenderedForm(instance.currentForm.id);
  };
  window.uploadPreviewSubmissionToFirebase = async function () {
    const instance = window.FormGearBuilderInstance;
    if (!window.formGearFirebaseManager || !window.formGearFirebaseManager.initialized) {
      showAlert('Firebase belum siap. Coba lagi dalam beberapa detik.');
      return;
    }
    if (!instance.currentForm || !instance.currentForm.id) {
      showAlert('Tidak ada form preview yang dapat diunggah.');
      return;
    }

    const submission = instance.submitRenderedForm(instance.currentForm.id);
    if (!submission) return;

    try {
      await window.formGearFirebaseManager.uploadFormData(instance.currentForm.id, submission);
      showAlert('Data preview berhasil diunggah ke Firebase.');
    } catch (error) {
      console.error(error);
      showAlert('Gagal mengunggah preview: ' + error.message);
    }
  };
  window.copyBuilderJson = function () {
    const output = document.getElementById('builder-json-output');
    if (!output) return;
    output.select?.();
    try {
      document.execCommand('copy');
      showAlert('JSON berhasil disalin.');
    } catch (error) {
      console.error(error);
      showAlert('Gagal menyalin JSON.');
    }
  };
  window.selectBuilderTemplate = function (formId) {
    window.FormGearBuilderInstance.selectForm(formId);
  };
})();
