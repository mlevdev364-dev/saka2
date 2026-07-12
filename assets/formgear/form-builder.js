(function () {
  const STORAGE_FORM_DEFINITIONS = "formgear_form_definitions";
  const STORAGE_SUBMISSIONS = "formgear_submissions";

  // ==========================================================================
  // VERSIONING (Semantic Versioning - semver.org) - INDEPENDEN dari APP_VERSION
  // ==========================================================================
  // Saka Tracker (index.html/sw.js/manifest.json) punya satu APP_VERSION yang
  // menandai versi aplikasi host secara keseluruhan. FormGear, sebagai
  // sub-modul yang dimuat di dalamnya, punya DUA lapis versi sendiri yang
  // sengaja dipisahkan dari APP_VERSION maupun dari satu sama lain:
  //
  //   1) FORMGEAR_ENGINE_VERSION - versi *engine/templating* ini sendiri
  //      (form-builder.js: field-type registry, renderer, recalculation
  //      engine, AI helper). Naik saat ADA PERUBAHAN PADA KODE ENGINE,
  //      terlepas dari form/template apa pun yang dibuat pengguna dengannya.
  //
  //   2) FORMGEAR_SCHEMA_VERSION - versi *bentuk data* form definition yang
  //      disimpan (struktur {id, name, sections[], fields[], ...}). Naik
  //      HANYA saat skema berubah tak-kompatibel (field baru yang wajib,
  //      rename kunci, dsb) dan perlu langkah migrasi - lihat
  //      migrateFormDefinition() di bawah.
  //
  // Terpisah lagi dari keduanya: setiap TEMPLATE/FORM hasil buatan pengguna
  // (disimpan lewat Form Builder) punya field `templateVersion` sendiri -
  // semver per-dokumen yang naik PATCH otomatis setiap kali form itu
  // disimpan ulang (lihat saveBuilderDefinition()). Ini memberi riwayat
  // versi per-form, independen dari versi engine maupun versi Saka Tracker.
  //
  // Ringkasan tiga lapis versi yang TIDAK saling terikat:
  //   APP_VERSION (index.html)  != FORMGEAR_ENGINE_VERSION (engine ini)
  //   != FORMGEAR_SCHEMA_VERSION (bentuk data)  != templateVersion (per-form)
  const FORMGEAR_ENGINE_VERSION = "1.2.0";
  const FORMGEAR_SCHEMA_VERSION = "1.1.0";

  function bumpPatchVersion(version) {
    const parts = String(version || "1.0.0")
      .split(".")
      .map((n) => parseInt(n, 10));
    while (parts.length < 3) parts.push(0);
    const safe = parts.map((n) => (Number.isFinite(n) && n >= 0 ? n : 0));
    safe[2] += 1;
    return safe.join(".");
  }

  // v1.1.0: memastikan setiap field bertipe "panel" (lama maupun baru)
  // punya properti repeater (`repeatable`/`repeatMin`/`repeatMax`/
  // `repeatItemLabel`) yang terdefinisi secara eksplisit, supaya form yang
  // dibuat sebelum fitur "Grup Field Dinamis / Repeater" ada tetap aman
  // dimuat (default: bukan grup berulang).
  function ensureRepeaterDefaults(fields) {
    (fields || []).forEach((f) => {
      if (!f || typeof f !== "object") return;
      if (f.type === "panel") {
        f.repeatable = !!f.repeatable;
        if (f.repeatable) {
          f.repeatMin = Number.isFinite(f.repeatMin) ? Math.max(0, f.repeatMin) : 1;
          f.repeatMax = Number.isFinite(f.repeatMax) ? Math.max(0, f.repeatMax) : 0;
          f.repeatItemLabel = f.repeatItemLabel || "Item";
        }
      }
      if (Array.isArray(f.children) && f.children.length) {
        ensureRepeaterDefaults(f.children);
      }
    });
  }

  // Migrasi form definition lama (dibuat sebelum FORMGEAR_SCHEMA_VERSION
  // ada) supaya tetap kompatibel. Titik ekstensi untuk migrasi bertahap di
  // masa depan: tambahkan blok `if (def.schemaVersion === "x.y.z") {...}`
  // baru di sini setiap kali FORMGEAR_SCHEMA_VERSION dinaikkan.
  function migrateFormDefinition(def) {
    if (!def || typeof def !== "object") return def;
    if (!def.schemaVersion) {
      // Form dari sebelum sistem versioning ini ada - anggap baseline.
      def.schemaVersion = "0.9.0";
    }
    if (!def.templateVersion) {
      def.templateVersion = "1.0.0";
    }
    // if (def.schemaVersion === "0.9.0") {
    //   ...langkah upgrade skema...
    //   def.schemaVersion = "1.0.0";
    // }
    if (def.schemaVersion === "0.9.0" || def.schemaVersion === "1.0.0") {
      (def.sections || []).forEach((section) => ensureRepeaterDefaults(section.fields));
      def.schemaVersion = FORMGEAR_SCHEMA_VERSION;
    }
    return def;
  }

  if (typeof window !== "undefined") {
    window.FormGearEngineVersion = FORMGEAR_ENGINE_VERSION;
    window.FormGearSchemaVersion = FORMGEAR_SCHEMA_VERSION;
    console.log(
      "[FormGear] Engine v" +
        FORMGEAR_ENGINE_VERSION +
        " \u00b7 Schema v" +
        FORMGEAR_SCHEMA_VERSION +
        " (independen dari APP_VERSION Saka Tracker)",
    );
  }

  // ==========================================================================
  // FIELD TYPE REGISTRY
  // Setiap tipe field di sini merepresentasikan satu tipe pertanyaan SurveyJS
  // (https://surveyjs.io/form-library/documentation/api-reference) dengan
  // perilaku fungsional yang berbeda-beda (bukan sekadar <input> generik):
  // kontrol input yang sesuai, cara menyimpan nilai, dan validasi "wajib diisi".
  // ==========================================================================
  const CHOICE_TYPES = ["radiogroup", "checkbox", "dropdown", "tagbox"];

  const FIELD_TYPE_GROUPS = [
    {
      label: "Teks & Angka",
      types: ["text", "comment"],
    },
    {
      label: "Pilihan",
      types: ["radiogroup", "checkbox", "dropdown", "tagbox", "boolean"],
    },
    {
      label: "Rating & Urutan",
      types: ["rating", "ranking"],
    },
    {
      label: "Matriks",
      types: ["matrix"],
    },
    {
      label: "Media & Berkas",
      types: ["imagepicker", "file", "signaturepad"],
    },
    {
      label: "Tata Letak",
      types: ["panel", "html"],
    },
    {
      label: "Lanjutan (Advanced)",
      types: ["autonumber", "customjs"],
    },
  ];

  const COMPUTED_FIELD_TYPES = ["autonumber", "customjs"];

  function isComputedType(type) {
    return COMPUTED_FIELD_TYPES.indexOf(type) !== -1;
  }

  const FIELD_TYPE_LABELS = {
    text: "Text (Isian Singkat)",
    comment: "Comment (Textarea)",
    radiogroup: "Radio Group (Pilihan Tunggal)",
    checkbox: "Checkbox (Pilihan Ganda)",
    dropdown: "Dropdown (Pilih Satu)",
    tagbox: "Tag Box (Multi-select)",
    boolean: "Boolean (Ya / Tidak)",
    rating: "Rating",
    ranking: "Ranking (Urutkan)",
    matrix: "Matrix (Grid Pilihan)",
    imagepicker: "Image Picker",
    file: "File Upload",
    signaturepad: "Signature Pad (Tanda Tangan)",
    panel: "Panel (Grup Visual)",
    html: "HTML Statis",
    autonumber: "Auto Number (Increment Otomatis)",
    customjs: "Custom JS Column (Logika Bisnis)",
  };

  const TEXT_INPUT_TYPES = [
    { value: "text", label: "Teks Bebas" },
    { value: "number", label: "Angka" },
    { value: "email", label: "Email" },
    { value: "password", label: "Password" },
    { value: "date", label: "Tanggal" },
    { value: "datetime-local", label: "Tanggal & Waktu" },
    { value: "time", label: "Waktu" },
    { value: "tel", label: "Nomor Telepon" },
    { value: "url", label: "URL" },
  ];

  const DEFAULT_CUSTOMJS_CODE =
    "// Variabel yang tersedia:\n" +
    "//   data  -> objek berisi semua nilai field lain (key = Nama Kunci field)\n" +
    "//   utils -> utils.toNumber(v), utils.sum(...v), utils.avg(...v), utils.today()\n" +
    "// Kolom ini WAJIB menggunakan `return` untuk menghasilkan nilainya.\n" +
    "// Contoh logika bisnis sederhana:\n" +
    "// return utils.toNumber(data.jumlah_a) + utils.toNumber(data.jumlah_b);\n\n" +
    "return '';";

  function isChoiceType(type) {
    return CHOICE_TYPES.indexOf(type) !== -1;
  }

  function isMultiValueType(type) {
    return type === "checkbox" || type === "tagbox";
  }

  function splitLines(value) {
    return String(value || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  // ==========================================================================
  // FORMGEAR AI HELPER
  // Orkestrator AI ringan & mandiri (tidak bergantung ke HybridAIOrchestrator
  // milik Saka Tracker di index.html) yang dipakai oleh Form Builder untuk:
  //   1) generateJsCode()  -> menghasilkan kode JS murni untuk kolom Custom JS
  //   2) suggestTemplate() -> saran template/UI form berdasarkan isi form
  // Membaca API key dari localStorage key yang SAMA dengan Saka Tracker
  // (STORAGE_KEY_MAIN) supaya pengguna tidak perlu konfigurasi API key dua
  // kali. Selalu punya fallback deterministik non-AI (tanpa network call)
  // agar fitur tetap berfungsi walau tidak ada API key yang diisi.
  // ==========================================================================
  const STORAGE_KEY_MAIN = "saka_tracker_v5_4";

  const FormGearAI = {
    lastProvider: null,

    getApiKeys() {
      try {
        const state = JSON.parse(localStorage.getItem(STORAGE_KEY_MAIN) || "{}");
        return (state && state.apiKeys) || {};
      } catch (error) {
        return {};
      }
    },

    getProviders() {
      const keys = this.getApiKeys();
      return [
        { name: "OpenAI", key: keys.openai, endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
        { name: "Gemini", key: keys.gemini, endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", model: "gemini-2.0-flash" },
        { name: "Mistral", key: keys.mistral, endpoint: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest" },
      ].filter((p) => !!p.key);
    },

    async callProvider(provider, systemPrompt, userPrompt) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let body, headers;
      const combinedPrompt = systemPrompt + "\n\n" + userPrompt;
      try {
        if (provider.name === "Gemini") {
          body = JSON.stringify({ contents: [{ parts: [{ text: combinedPrompt }] }] });
          headers = { "Content-Type": "application/json", "x-goog-api-key": provider.key };
        } else {
          body = JSON.stringify({
            model: provider.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 700,
          });
          headers = { "Content-Type": "application/json", Authorization: "Bearer " + provider.key };
        }
        const res = await fetch(provider.endpoint, { method: "POST", headers, body, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData.error && errData.error.message) || "HTTP " + res.status);
        }
        const data = await res.json();
        if (provider.name === "Gemini") {
          return (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || "";
        }
        return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
      } finally {
        clearTimeout(timeoutId);
      }
    },

    // Mencoba provider satu per satu (OpenAI -> Gemini -> Mistral), pakai
    // yang pertama berhasil. Melempar error hanya jika SEMUA gagal/tidak
    // ada key sama sekali (dipakai pemanggil untuk trigger fallback).
    async generateRaw(systemPrompt, userPrompt) {
      const providers = this.getProviders();
      if (!providers.length) {
        const err = new Error("Belum ada API key AI yang dikonfigurasi di Pengaturan.");
        err.code = "NO_PROVIDER";
        throw err;
      }
      let lastError = null;
      for (const provider of providers) {
        try {
          const text = await this.callProvider(provider, systemPrompt, userPrompt);
          if (text && text.trim()) {
            this.lastProvider = provider.name;
            return text;
          }
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Semua provider AI gagal merespons.");
    },

    stripCodeFences(text) {
      let out = String(text || "").trim();
      out = out.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
      return out.trim();
    },

    // Menghasilkan HANYA kode JS (tanpa penjelasan/markdown) untuk sebuah
    // field bertipe Custom JS Column, berdasarkan label field & field lain
    // yang tersedia di form (supaya AI tahu nama variabel `data.<nama>`
    // yang valid untuk dipakai).
    async generateJsCode({ label, name, instruction, context }) {
      const fieldList = (context || [])
        .map((f) => `- data.${f.name} (${f.type}) // label: "${f.label || ""}"`)
        .join("\n");
      const systemPrompt =
        "Anda adalah mesin penghasil kode JavaScript untuk fitur 'Custom JS Column' pada sebuah form builder. " +
        "ATURAN KETAT: keluarkan HANYA kode JavaScript murni, tanpa penjelasan, tanpa markdown code fences, tanpa komentar pembuka. " +
        "Kode akan dieksekusi via `new Function('data', 'utils', kode)`. " +
        "Variabel `data` berisi seluruh nilai field lain di form (object, key = nama field). " +
        "Variabel `utils` menyediakan utils.toNumber(v), utils.sum(...v), utils.avg(...v), utils.today(). " +
        "Kode WAJIB memiliki statement `return` yang mengembalikan nilai kolom ini (string atau number).";
      const userPrompt =
        `Nama field ini: "${name || ""}"\n` +
        `Label field ini: "${label || ""}"\n` +
        `Instruksi logika bisnis dari pengguna: "${instruction || label || "Buat logika yang masuk akal berdasarkan label field."}"\n` +
        (fieldList
          ? `Field lain yang tersedia di form ini (gunakan nama-nama ini persis, jangan mengarang nama field baru):\n${fieldList}\n`
          : "Tidak ada informasi field lain di form ini.\n") +
        "Tuliskan kode JS-nya sekarang.";
      const raw = await this.generateRaw(systemPrompt, userPrompt);
      return this.stripCodeFences(raw);
    },

    // Saran template/UI berdasarkan isi form saat ini (nama, deskripsi,
    // daftar section & field). Mengembalikan teks singkat (Bahasa
    // Indonesia) berisi rekomendasi template & struktur UI yang cocok.
    async suggestTemplate({ formName, formDescription, fieldsSummary, availableTemplates }) {
      const systemPrompt =
        "Anda adalah konsultan UX untuk form builder survei/pendataan lapangan (gaya SurveyJS). " +
        "Berikan saran template & struktur UI yang SINGKAT (maksimal 5 poin, Bahasa Indonesia, tanpa markdown heading berlebihan), " +
        "berdasarkan isi form yang diberikan. Fokus pada: template mana yang paling cocok dari daftar yang tersedia (jika ada yang cocok), " +
        "urutan/pengelompokan section, tipe field yang sebaiknya ditambahkan/diubah, dan potensi logika bisnis (autonumber/custom JS) yang relevan.";
      const userPrompt =
        `Nama form: "${formName || "(tanpa nama)"}"\n` +
        `Deskripsi form: "${formDescription || "(tidak ada deskripsi)"}"\n` +
        `Ringkasan isi form:\n${fieldsSummary || "(form masih kosong)"}\n` +
        (availableTemplates && availableTemplates.length
          ? `Template yang tersedia di sistem: ${availableTemplates.join(", ")}\n`
          : "");
      const raw = await this.generateRaw(systemPrompt, userPrompt);
      return raw.trim();
    },

    deterministicTemplateSuggestion({ fieldTypeCounts, sectionCount }) {
      const parts = [];
      parts.push("Saran otomatis (tanpa AI, karena belum ada API key yang dikonfigurasi di Pengaturan):");
      if (sectionCount <= 1) {
        parts.push("- Pertimbangkan memecah form menjadi beberapa section agar lebih mudah diisi bertahap.");
      }
      if ((fieldTypeCounts.text || 0) > 6) {
        parts.push("- Banyak field teks bebas; pertimbangkan mengganti sebagian dengan dropdown/radiogroup agar data lebih konsisten.");
      }
      if (!fieldTypeCounts.autonumber) {
        parts.push("- Tambahkan 1 field Auto Number di section pertama sebagai nomor urut responden/SLS.");
      }
      if (!fieldTypeCounts.customjs && (fieldTypeCounts.number || fieldTypeCounts.text)) {
        parts.push("- Jika ada kolom yang nilainya bisa diturunkan dari field lain (total, selisih, kategori), gunakan Custom JS Column.");
      }
      parts.push("- Isi API key OpenAI/Gemini/Mistral di Pengaturan untuk mendapatkan saran yang disesuaikan konten form oleh AI.");
      return parts.join("\n");
    },
  };

  class FormGearBuilder {
    constructor() {
      this.localDefinitions = this.loadLocalDefinitions();
      this.currentFormId = null;
      this.currentForm = null;
      this.initialized = false;
      // Penyimpanan sementara untuk tipe field yang nilainya tidak bisa
      // langsung dibaca lewat DOM biasa (file & tanda tangan dibaca async
      // lewat FileReader / canvas), key = field path.
      this.fileDataStore = {};
      this.signatureDataStore = {};
      // Status async untuk fitur AI (per-field code generation & saran
      // template), dipakai supaya renderBuilderPage() bisa menampilkan
      // status "loading"/"error"/"done" tanpa kehilangan input pengguna.
      this.aiCodeState = {};
      this.aiTemplateState = { status: "idle", message: "" };
      // Status mode-seleksi untuk fitur "pilih beberapa field yang sudah
      // ada -> jadikan grup berulang" (Grup Field Dinamis / Repeater).
      // Hanya satu section yang bisa dalam mode seleksi pada satu waktu.
      // `paths` menampung path field terpilih di KEDALAMAN APA PUN (bukan
      // cuma level atas) - lihat createRepeaterGroupFromSelection() untuk
      // bagaimana konflik visibleIfValue diselesaikan secara presisi saat
      // field bercampur kedalaman ikut dipilih.
      this.groupSelection = {
        sectionIndex: null,
        paths: [],
        groupName: "",
        itemLabel: "",
      };
    }

    initFormGear() {
      if (this.initialized) return;
      this.initialized = true;
      this.currentFormId = this.getDefaultFormId();
      this.currentForm = this.getFormDefinition(this.currentFormId);
    }

    getDefaultFormId() {
      const all = this.getAllFormDefinitions();
      return all.length ? all[0].id : null;
    }

    loadLocalDefinitions() {
      try {
        const raw =
          JSON.parse(localStorage.getItem(STORAGE_FORM_DEFINITIONS) || "[]") ||
          [];
        // Setiap definisi form yang dimuat dilewatkan lewat
        // migrateFormDefinition() supaya form lama (dibuat sebelum ada
        // schemaVersion/templateVersion) otomatis mendapat stempel versi
        // baseline tanpa kehilangan data yang sudah ada.
        return raw.map((def) => migrateFormDefinition(def));
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
      if (!formId) return null;
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
      // Catatan: sample/demo forms sudah dihapus (lihat demo-forms.js),
      // FormGearSampleForms kini array kosong secara default. Fungsi ini
      // tetap menggabungkannya untuk kompatibilitas jika suatu saat template
      // contoh ingin ditambahkan kembali.
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

    // ------------------------------------------------------------------
    // Field defaults per tipe (menyesuaikan skema opsi bawaan SurveyJS)
    // ------------------------------------------------------------------
    applyTypeDefaults(field) {
      switch (field.type) {
        case "text":
          field.inputType = field.inputType || "text";
          break;
        case "comment":
          field.rows = field.rows || 4;
          break;
        case "radiogroup":
        case "checkbox":
        case "dropdown":
        case "tagbox":
          if (!Array.isArray(field.options) || !field.options.length) {
            field.options = ["Opsi 1", "Opsi 2", "Opsi 3"];
          }
          field.orientation = field.orientation || "vertical";
          break;
        case "boolean":
          field.labelTrue = field.labelTrue || "Ya";
          field.labelFalse = field.labelFalse || "Tidak";
          break;
        case "rating":
          field.rateMin = Number.isFinite(field.rateMin) ? field.rateMin : 1;
          field.rateMax = Number.isFinite(field.rateMax) ? field.rateMax : 5;
          break;
        case "ranking":
          if (!Array.isArray(field.options) || !field.options.length) {
            field.options = ["Item 1", "Item 2", "Item 3"];
          }
          break;
        case "matrix":
          if (!Array.isArray(field.rows) || !field.rows.length) {
            field.rows = ["Baris 1", "Baris 2"];
          }
          if (!Array.isArray(field.columns) || !field.columns.length) {
            field.columns = ["Kolom 1", "Kolom 2"];
          }
          break;
        case "imagepicker":
          if (!Array.isArray(field.imageOptions) || !field.imageOptions.length) {
            field.imageOptions = [
              { text: "Opsi 1", imageLink: "" },
              { text: "Opsi 2", imageLink: "" },
            ];
          }
          break;
        case "file":
          field.acceptTypes = field.acceptTypes || "image/*,.pdf";
          field.allowMultiple = !!field.allowMultiple;
          break;
        case "html":
          field.html = field.html || "<p>Konten statis di sini.</p>";
          break;
        case "autonumber":
          field.autoStart = Number.isFinite(field.autoStart) ? field.autoStart : 1;
          field.autoStep = Number.isFinite(field.autoStep) ? field.autoStep : 1;
          field.autoPadding = Number.isFinite(field.autoPadding) ? field.autoPadding : 3;
          field.autoPrefix = field.autoPrefix || "";
          field.required = false;
          break;
        case "customjs":
          field.jsCode =
            typeof field.jsCode === "string" && field.jsCode.trim()
              ? field.jsCode
              : DEFAULT_CUSTOMJS_CODE;
          field.required = false;
          break;
        case "panel":
          // Grup Field Dinamis / Repeater: sebuah panel bisa ditandai
          // "berulang" (repeatable) supaya field-field di dalamnya dapat
          // digandakan berkali-kali oleh pengisi form (contoh kasus: 1
          // rumah punya banyak Kepala Keluarga). Defaultnya bukan grup
          // berulang (repeatable: false) agar panel biasa tidak berubah
          // perilaku.
          field.repeatable = !!field.repeatable;
          if (field.repeatable) {
            field.repeatMin = Number.isFinite(field.repeatMin)
              ? Math.max(0, field.repeatMin)
              : 1;
            field.repeatMax = Number.isFinite(field.repeatMax)
              ? Math.max(0, field.repeatMax)
              : 0; // 0 = tanpa batas
            field.repeatItemLabel = field.repeatItemLabel || "Item";
          }
          break;
        case "signaturepad":
        default:
          break;
      }
      return field;
    }

    createNewField(type) {
      const field = {
        label: "Pertanyaan Baru",
        name: "field_" + Math.random().toString(36).substring(2, 8),
        type: type || "text",
        required: false,
        placeholder: "",
        options: [],
        children: [],
      };
      return this.applyTypeDefaults(field);
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

      if (!selectedForm) {
        controls.innerHTML =
          '<p style="color: var(--text-muted);">Belum ada form. Klik "Buat Form Baru" untuk mulai membangun form pertama Anda.</p>';
        preview.innerHTML = "";
        return;
      }

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

      // Dropdown "Form yang Diedit" -- diisi dari seluruh definisi form
      // lokal (sample/demo sudah tidak ada) sehingga pengguna dapat memilih
      // form mana yang ingin diedit di Form Builder.
      const allDefinitions = this.getAllFormDefinitions();
      const isKnownForm = allDefinitions.some(
        (def) => def.id === selectedForm.id,
      );
      const loadFormOptions =
        (isKnownForm
          ? ""
          : `<option value="" selected>(Form baru - belum disimpan)</option>`) +
        allDefinitions
          .map(
            (def) => `
                <option value="${def.id}" ${def.id === selectedForm.id ? "selected" : ""}>
                    ${this.escapeHtml(def.name || def.id)}
                </option>
            `,
          )
          .join("");

      const versionBadge = `
                <div class="formgear-version-badge" style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; font-size:0.75rem; color:var(--text-muted); margin-bottom:10px;">
                    <span title="Versi form/template ini sendiri - naik PATCH otomatis setiap kali disimpan ulang, terpisah dari versi engine dan versi Saka Tracker.">
                        <i class="bi bi-tag-fill"></i> Template v${this.escapeHtml(selectedForm.templateVersion || "1.0.0")}
                    </span>
                    <span title="Versi bentuk-data (schema) form definition yang dipakai form ini.">
                        <i class="bi bi-diagram-3-fill"></i> Schema v${this.escapeHtml(selectedForm.schemaVersion || FORMGEAR_SCHEMA_VERSION)}
                    </span>
                    <span title="Versi engine/templating FormGear (form-builder.js) - independen dari APP_VERSION Saka Tracker.">
                        <i class="bi bi-gear-fill"></i> Engine v${FORMGEAR_ENGINE_VERSION}
                    </span>
                </div>
            `;

      controls.innerHTML = `
                ${versionBadge}
                <div class="formgear-builder-toolbar">
                    <div style="flex:1; min-width:220px;">
                        <label>Form yang Diedit</label>
                        <select id="builder-load-form-selector" onchange="FormGearBuilderInstance.selectForm(this.value)">
                            ${loadFormOptions}
                        </select>
                    </div>
                    <div style="flex:1; min-width:220px;">
                        <label>Template Form</label>
                        <select id="builder-template-selector" onchange="FormGearBuilderInstance.updateBuilderMeta('templateId', this.value)">
                            ${templateOptions}
                        </select>
                    </div>
                    <button class="btn-success" onclick="FormGearBuilderInstance.addBuilderSection()"><i class="bi bi-folder-plus"></i> Tambah Section</button>
                    <button class="btn-success" onclick="FormGearBuilderInstance.saveBuilderDefinition()"><i class="bi bi-save"></i> Simpan Definisi</button>
                    <button class="btn-outline" onclick="FormGearBuilderInstance.generateBuilderJson()"><i class="bi bi-code-slash"></i> Generate JSON</button>
                    <button class="btn-outline" onclick="uploadBuilderDefinitionToFirebase()"><i class="bi bi-cloud-upload"></i> Unggah Definisi</button>
                    <button class="btn-outline ai-suggest-btn" ${this.aiTemplateState.status === "loading" ? "disabled" : ""} onclick="FormGearBuilderInstance.requestAiTemplateSuggestion()">
                        ${this.aiTemplateState.status === "loading" ? '<i class="bi bi-arrow-repeat ai-spin"></i> Menganalisis Form...' : '<i class="bi bi-stars"></i> Saran Template AI'}
                    </button>
                </div>
                ${this.renderAiTemplatePanel()}
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
            `;

      preview.innerHTML = this.renderFormPreview(selectedForm);
      this.generateBuilderJson();
    }

    renderBuilderSections(formDef) {
      if (!formDef || !Array.isArray(formDef.sections)) {
        return '<p style="color: var(--text-muted);">Tidak ada section.</p>';
      }
      return formDef.sections
        .map((section, sectionIndex) => {
          const isSelecting = this.groupSelection.sectionIndex === sectionIndex;
          const selectionBar = isSelecting
            ? `
                    <div class="repeater-group-toolbar">
                        <span class="repeater-group-count"><i class="bi bi-check2-square"></i> ${this.groupSelection.paths.length} field terpilih</span>
                        <input type="text" placeholder="Nama grup (contoh: Kepala Keluarga)" value="${this.escapeHtml(this.groupSelection.groupName || "")}" onchange="FormGearBuilderInstance.updateGroupSelectionMeta('groupName', this.value)">
                        <input type="text" placeholder="Label 1 baris/item (contoh: Kepala Keluarga)" value="${this.escapeHtml(this.groupSelection.itemLabel || "")}" onchange="FormGearBuilderInstance.updateGroupSelectionMeta('itemLabel', this.value)">
                        <button class="btn-success" onclick="FormGearBuilderInstance.createRepeaterGroupFromSelection(${sectionIndex})"><i class="bi bi-arrow-repeat"></i> Jadikan Grup Berulang</button>
                        <button class="btn-outline" onclick="FormGearBuilderInstance.toggleGroupSelectMode(${sectionIndex})">Batal</button>
                    </div>
                    <p class="field-type-hint"><i class="bi bi-info-circle"></i> Centang field yang ingin digabung — boleh field level atas maupun child field bersarang. Jika induk dicentang, seluruh child-nya otomatis ikut (tetap bersarang, tidak perlu dicentang satu-satu). Jika hanya sebagian child yang dicentang tanpa induknya, aturan tampil-bersyarat (visibleIfValue) child tersebut dilepas otomatis karena induk pilihannya tidak ikut pindah ke grup.</p>
                `
            : "";
          return `
                <div class="formgear-builder-section" id="builder-section-${sectionIndex}">
                    <div class="section-header">
                        <strong class="section-title">Section ${sectionIndex + 1}</strong>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button class="btn-outline" style="width:auto; margin-top:0;" onclick="FormGearBuilderInstance.toggleGroupSelectMode(${sectionIndex})"><i class="bi bi-collection"></i> ${isSelecting ? "Batal Pilih Field" : "Pilih Field untuk Grup Berulang"}</button>
                            <button class="btn-danger" onclick="FormGearBuilderInstance.removeBuilderSection(${sectionIndex})"><i class="bi bi-trash3"></i> Hapus Section</button>
                        </div>
                    </div>
                    ${selectionBar}
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
            `;
        })
        .join("");
    }

    renderBuilderFields(section, sectionIndex) {
      if (!section.fields || !section.fields.length) {
        return '<p style="color: var(--text-muted);">Belum ada field dalam section ini.</p>';
      }
      return section.fields
        .map((field, fieldIndex) =>
          this.renderBuilderField(sectionIndex, fieldIndex, field, 0, null),
        )
        .join("");
    }

    renderFieldTypeOptions(selectedType) {
      return FIELD_TYPE_GROUPS.map((group) => {
        const options = group.types
          .map(
            (type) => `
                <option value="${type}" ${selectedType === type ? "selected" : ""}>${FIELD_TYPE_LABELS[type]}</option>
            `,
          )
          .join("");
        return `<optgroup label="${group.label}">${options}</optgroup>`;
      }).join("");
    }

    // Editor tambahan sesuai tipe field terpilih (opsi pilihan, rating
    // min/max, baris/kolom matrix, konten HTML, dsb). Ini adalah inti dari
    // penyesuaian "fungsional setiap type field" ala SurveyJS.
    renderBuilderTypeEditor(field, sectionIndex, path, depth) {
      const onChange = (key) =>
        `FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${path}', ${depth}, '${key}', this.value)`;
      const onChangeChecked = (key) =>
        `FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${path}', ${depth}, '${key}', this.checked)`;

      if (isChoiceType(field.type)) {
        const optionsText = (field.options || []).join("\n");
        return `
                    <div class="formgear-builder-row">
                        <div style="grid-column:1/-1;">
                            <label>Opsi Pilihan (satu opsi per baris)</label>
                            <textarea onchange="${onChange("optionsText")}">${this.escapeHtml(optionsText)}</textarea>
                        </div>
                        ${
                          field.type === "radiogroup" || field.type === "checkbox"
                            ? `
                        <div>
                            <label>Orientasi</label>
                            <select onchange="${onChange("orientation")}">
                                <option value="vertical" ${field.orientation === "vertical" ? "selected" : ""}>Vertikal</option>
                                <option value="horizontal" ${field.orientation === "horizontal" ? "selected" : ""}>Horizontal</option>
                            </select>
                        </div>`
                            : ""
                        }
                    </div>
                `;
      }

      if (field.type === "text") {
        return `
                    <div class="formgear-builder-row">
                        <div>
                            <label>Jenis Input</label>
                            <select onchange="${onChange("inputType")}">
                                ${TEXT_INPUT_TYPES.map((opt) => `<option value="${opt.value}" ${field.inputType === opt.value ? "selected" : ""}>${opt.label}</option>`).join("")}
                            </select>
                        </div>
                    </div>
                `;
      }

      if (field.type === "comment") {
        return `
                    <div class="formgear-builder-row">
                        <div>
                            <label>Jumlah Baris</label>
                            <input type="number" min="2" max="12" value="${field.rows || 4}" onchange="${onChange("rows")}">
                        </div>
                    </div>
                `;
      }

      if (field.type === "boolean") {
        return `
                    <div class="formgear-builder-row">
                        <div>
                            <label>Label "Ya"</label>
                            <input type="text" value="${this.escapeHtml(field.labelTrue || "Ya")}" onchange="${onChange("labelTrue")}">
                        </div>
                        <div>
                            <label>Label "Tidak"</label>
                            <input type="text" value="${this.escapeHtml(field.labelFalse || "Tidak")}" onchange="${onChange("labelFalse")}">
                        </div>
                    </div>
                `;
      }

      if (field.type === "rating") {
        return `
                    <div class="formgear-builder-row">
                        <div>
                            <label>Nilai Minimum</label>
                            <input type="number" value="${field.rateMin ?? 1}" onchange="${onChange("rateMin")}">
                        </div>
                        <div>
                            <label>Nilai Maksimum</label>
                            <input type="number" value="${field.rateMax ?? 5}" onchange="${onChange("rateMax")}">
                        </div>
                    </div>
                `;
      }

      if (field.type === "ranking") {
        const optionsText = (field.options || []).join("\n");
        return `
                    <div class="formgear-builder-row">
                        <div style="grid-column:1/-1;">
                            <label>Item yang Diurutkan (satu item per baris)</label>
                            <textarea onchange="${onChange("optionsText")}">${this.escapeHtml(optionsText)}</textarea>
                        </div>
                    </div>
                `;
      }

      if (field.type === "matrix") {
        const rowsText = (field.rows || []).join("\n");
        const colsText = (field.columns || []).join("\n");
        return `
                    <div class="formgear-builder-row">
                        <div>
                            <label>Baris Matrix (satu per baris)</label>
                            <textarea onchange="${onChange("rowsText")}">${this.escapeHtml(rowsText)}</textarea>
                        </div>
                        <div>
                            <label>Kolom Matrix (satu per baris)</label>
                            <textarea onchange="${onChange("columnsText")}">${this.escapeHtml(colsText)}</textarea>
                        </div>
                    </div>
                `;
      }

      if (field.type === "imagepicker") {
        const imageText = (field.imageOptions || [])
          .map((opt) => `${opt.text || ""}|${opt.imageLink || ""}`)
          .join("\n");
        return `
                    <div class="formgear-builder-row">
                        <div style="grid-column:1/-1;">
                            <label>Opsi Gambar (format: Label|URL Gambar, satu per baris)</label>
                            <textarea onchange="${onChange("imageOptionsText")}">${this.escapeHtml(imageText)}</textarea>
                        </div>
                    </div>
                `;
      }

      if (field.type === "file") {
        return `
                    <div class="formgear-builder-row">
                        <div>
                            <label>Tipe Berkas Diizinkan</label>
                            <input type="text" value="${this.escapeHtml(field.acceptTypes || "")}" placeholder="image/*,.pdf" onchange="${onChange("acceptTypes")}">
                        </div>
                        <div>
                            <label style="display:flex; align-items:center; gap:8px; margin-top:22px;">
                                <input type="checkbox" style="width:auto;" ${field.allowMultiple ? "checked" : ""} onchange="${onChangeChecked("allowMultiple")}">
                                Izinkan lebih dari satu berkas
                            </label>
                        </div>
                    </div>
                `;
      }

      if (field.type === "html") {
        return `
                    <div class="formgear-builder-row">
                        <div style="grid-column:1/-1;">
                            <label>Konten HTML Statis</label>
                            <textarea onchange="${onChange("html")}">${this.escapeHtml(field.html || "")}</textarea>
                        </div>
                    </div>
                `;
      }

      if (field.type === "signaturepad" || field.type === "panel") {
        return "";
      }

      if (field.type === "autonumber") {
        const previewSeq = Number(field.autoStart) || 1;
        const previewValue = this.formatAutoNumber(field, previewSeq);
        return `
                    <div class="formgear-builder-row">
                        <div>
                            <label>Mulai Dari</label>
                            <input type="number" value="${Number.isFinite(field.autoStart) ? field.autoStart : 1}" onchange="${onChange("autoStart")}">
                        </div>
                        <div>
                            <label>Kelipatan (Step)</label>
                            <input type="number" value="${Number.isFinite(field.autoStep) ? field.autoStep : 1}" onchange="${onChange("autoStep")}">
                        </div>
                        <div>
                            <label>Jumlah Digit (Padding)</label>
                            <input type="number" min="0" max="10" value="${Number.isFinite(field.autoPadding) ? field.autoPadding : 3}" onchange="${onChange("autoPadding")}">
                        </div>
                        <div>
                            <label>Prefix (opsional)</label>
                            <input type="text" value="${this.escapeHtml(field.autoPrefix || "")}" placeholder="Contoh: SLS-" onchange="${onChange("autoPrefix")}">
                        </div>
                    </div>
                    <p class="autonumber-preview"><i class="bi bi-eye"></i> Contoh nilai pertama: <code>${this.escapeHtml(previewValue)}</code></p>
                    <p class="field-type-hint"><i class="bi bi-info-circle"></i> Nomor bertambah otomatis mengikuti jumlah data/submission yang sudah tersimpan untuk form ini &mdash; tidak bisa diubah manual saat pengisian.</p>
                `;
      }

      if (field.type === "customjs") {
        const aiKey = sectionIndex + ":" + path;
        const aiState = this.aiCodeState[aiKey] || {};
        const isLoading = aiState.status === "loading";
        return `
                    <div class="formgear-builder-row">
                        <div style="grid-column:1/-1;">
                            <div class="customjs-editor-header">
                                <label style="margin:0;">Kode JavaScript (Logika Bisnis)</label>
                            </div>
                            <textarea class="code-editor" spellcheck="false" onchange="${onChange("jsCode")}">${this.escapeHtml(field.jsCode || DEFAULT_CUSTOMJS_CODE)}</textarea>
                            <p class="field-type-hint"><i class="bi bi-info-circle"></i> Nilai kolom ini dihitung ulang otomatis setiap kali data field lain berubah. Gunakan <code>data.&lt;nama_field&gt;</code> untuk membaca nilai field lain, dan wajib <code>return</code> nilainya.</p>
                            <div class="ai-code-panel">
                                <input type="text" class="ai-instruction-input" placeholder="Jelaskan logika bisnis yang diinginkan (opsional, kalau kosong AI memakai label field)" value="${this.escapeHtml(aiState.instruction || "")}" onchange="FormGearBuilderInstance.setAiInstruction('${aiKey}', this.value)">
                                <button type="button" class="btn-ai-generate" ${isLoading ? "disabled" : ""} onclick="FormGearBuilderInstance.generateCustomJsCode(${sectionIndex}, '${path}', ${depth})">
                                    ${isLoading ? '<i class="bi bi-arrow-repeat ai-spin"></i> Menghasilkan Kode...' : '<i class="bi bi-stars"></i> Generate dengan AI'}
                                </button>
                                ${aiState.status === "error" ? `<div class="ai-status ai-status-error"><i class="bi bi-exclamation-triangle-fill"></i> ${this.escapeHtml(aiState.message || "Gagal menghasilkan kode.")}</div>` : ""}
                                ${aiState.status === "done" ? `<div class="ai-status ai-status-ok"><i class="bi bi-check-circle-fill"></i> ${this.escapeHtml(aiState.message || "Kode berhasil dibuat.")}</div>` : ""}
                            </div>
                        </div>
                    </div>
                `;
      }

      if (field.type === "panel") {
        const hasChildren = Array.isArray(field.children) && field.children.length > 0;
        return `
                    <div class="formgear-builder-row">
                        <div>
                            <label style="display:flex; align-items:center; gap:8px; margin-top:22px;">
                                <input type="checkbox" style="width:auto;" ${field.repeatable ? "checked" : ""} onchange="${onChangeChecked("repeatable")}">
                                Field Berulang (Repeater)
                            </label>
                        </div>
                        ${
                          field.repeatable
                            ? `
                        <div>
                            <label>Label 1 Item (contoh: "Kepala Keluarga")</label>
                            <input type="text" value="${this.escapeHtml(field.repeatItemLabel || "Item")}" onchange="${onChange("repeatItemLabel")}">
                        </div>
                        <div>
                            <label>Minimal Instance</label>
                            <input type="number" min="0" value="${Number.isFinite(field.repeatMin) ? field.repeatMin : 1}" onchange="${onChange("repeatMin")}">
                        </div>
                        <div>
                            <label>Maksimal Instance (0 = tanpa batas)</label>
                            <input type="number" min="0" value="${Number.isFinite(field.repeatMax) ? field.repeatMax : 0}" onchange="${onChange("repeatMax")}">
                        </div>`
                            : ""
                        }
                    </div>
                    ${
                      field.repeatable
                        ? `
                    <p class="field-type-hint"><i class="bi bi-info-circle"></i> Pengisi form dapat menambah/menghapus baris "${this.escapeHtml(field.repeatItemLabel || "Item")}" ini berulang kali (contoh: banyak Kepala Keluarga dalam 1 rumah). Semua field di dalam grup ini digandakan per baris.</p>
                    ${
                      hasChildren
                        ? `<button type="button" class="btn-outline" style="width:auto;" onclick="FormGearBuilderInstance.ungroupRepeaterField(${sectionIndex}, '${path}', ${depth})"><i class="bi bi-box-arrow-up"></i> Ubah jadi Field Biasa (Ungroup)</button>`
                        : ""
                    }`
                        : ""
                    }
                `;
      }

      return "";
    }

    renderBuilderField(sectionIndex, fieldIndex, field, depth, parentField) {
      const indentStyle = depth > 0 ? "margin-left: " + depth * 12 + "px;" : "";
      const childFields = Array.isArray(field.children) ? field.children : [];
      const isStatic =
        field.type === "html" ||
        field.type === "panel" ||
        isComputedType(field.type);

      // Kondisi tampil (mirip visibleIf SurveyJS sederhana): hanya berlaku
      // untuk field anak (depth > 0) dari induk bertipe pilihan.
      let visibleIfEditor = "";
      if (depth > 0 && parentField && isChoiceType(parentField.type)) {
        const parentOptions = parentField.options || [];
        const currentValue = field.visibleIfValue || "";
        visibleIfEditor = `
                    <div class="formgear-builder-row">
                        <div>
                            <label>Tampilkan Field Ini Jika Induk =</label>
                            <select onchange="FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${fieldIndex}', ${depth}, 'visibleIfValue', this.value)">
                                <option value="" ${currentValue === "" ? "selected" : ""}>(Selalu tampil)</option>
                                ${parentOptions.map((opt) => `<option value="${this.escapeHtml(opt)}" ${currentValue === opt ? "selected" : ""}>${this.escapeHtml(opt)}</option>`).join("")}
                            </select>
                        </div>
                    </div>
                `;
      }

      const groupSelectActive = this.groupSelection.sectionIndex === sectionIndex;
      const currentPath = String(fieldIndex);
      const isSelectedForGroup =
        groupSelectActive && this.groupSelection.paths.includes(currentPath);
      // Field ini otomatis ikut ke grup karena salah satu leluhurnya
      // (induk/kakek) sudah dicentang - seluruh subtree induk ikut
      // pindah sebagai satu kesatuan, jadi mencentang field ini secara
      // terpisah tidak diperlukan (dan diabaikan bila dicentang).
      const isAutoIncludedViaAncestor =
        groupSelectActive &&
        !isSelectedForGroup &&
        this.groupSelection.paths.some((p) => currentPath.indexOf(p + "-") === 0);
      const groupSelectRow = groupSelectActive
        ? `
                    <div class="repeater-select-row">
                        <label style="display:flex; align-items:center; gap:8px; margin-bottom:0;">
                            <input type="checkbox" style="width:auto;" ${isSelectedForGroup || isAutoIncludedViaAncestor ? "checked" : ""} ${isAutoIncludedViaAncestor ? "disabled" : ""} onchange="FormGearBuilderInstance.toggleFieldForGroupSelection(${sectionIndex}, '${currentPath}')">
                            ${isAutoIncludedViaAncestor ? "Ikut otomatis (induk sudah dipilih)" : "Pilih field ini untuk grup berulang"}
                        </label>
                    </div>
                `
        : "";

      return `
                <div class="formgear-builder-field${isSelectedForGroup ? " repeater-select-checked" : ""}" style="${indentStyle}">
                    ${groupSelectRow}
                    <div class="formgear-builder-row">
                        <div>
                            <label>
                                Label Field
                                ${
                                  field.type === "customjs"
                                    ? `<button type="button" class="ai-badge-inline" title="Generate kode JS otomatis dari label field ini" onclick="FormGearBuilderInstance.generateCustomJsCode(${sectionIndex}, '${fieldIndex}', ${depth})"><i class="bi bi-stars"></i> AI</button>`
                                    : ""
                                }
                            </label>
                            <input type="text" value="${this.escapeHtml(field.label || "")}" onchange="FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${fieldIndex}', ${depth}, 'label', this.value)">
                        </div>
                        <div>
                            <label>Nama Kunci</label>
                            <input type="text" value="${this.escapeHtml(field.name || "")}" onchange="FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${fieldIndex}', ${depth}, 'name', this.value)">
                        </div>
                        <div>
                            <label>Tipe Field</label>
                            <select onchange="FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${fieldIndex}', ${depth}, 'type', this.value)">
                                ${this.renderFieldTypeOptions(field.type)}
                            </select>
                        </div>
                        ${
                          !isStatic
                            ? `
                        <div>
                            <label style="display:flex; align-items:center; gap:8px; margin-top:22px;">
                                <input type="checkbox" style="width:auto;" ${field.required ? "checked" : ""} onchange="FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${fieldIndex}', ${depth}, 'required', this.checked)">
                                Wajib diisi
                            </label>
                        </div>`
                            : ""
                        }
                    </div>
                    ${
                      !isStatic && field.type !== "boolean"
                        ? `
                    <div class="formgear-builder-row">
                        <div style="grid-column: 1/-1;">
                            <label>Placeholder / Teks Bantuan</label>
                            <input type="text" value="${this.escapeHtml(field.placeholder || "")}" onchange="FormGearBuilderInstance.updateBuilderField(${sectionIndex}, '${fieldIndex}', ${depth}, 'placeholder', this.value)">
                        </div>
                    </div>`
                        : ""
                    }
                    ${this.renderBuilderTypeEditor(field, sectionIndex, fieldIndex, depth)}
                    ${visibleIfEditor}
                    <div class="field-actions">
                        <button class="btn-outline" onclick="FormGearBuilderInstance.addBuilderChildField(${sectionIndex}, '${fieldIndex}', ${depth})"><i class="bi bi-arrow-return-right"></i> Tambah Child Field</button>
                        <button class="btn-danger" onclick="FormGearBuilderInstance.removeBuilderField(${sectionIndex}, '${fieldIndex}', ${depth})"><i class="bi bi-trash3"></i> Hapus Field</button>
                    </div>
                    ${childFields.map((child, childIndex) => this.renderBuilderField(sectionIndex, `${fieldIndex}-${childIndex}`, child, depth + 1, field)).join("")}
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

      switch (key) {
        case "type":
          field.type = value;
          this.applyTypeDefaults(field);
          break;
        case "optionsText":
          field.options = splitLines(value);
          break;
        case "rowsText":
          field.rows = splitLines(value);
          break;
        case "columnsText":
          field.columns = splitLines(value);
          break;
        case "imageOptionsText":
          field.imageOptions = splitLines(value).map((line) => {
            const [text, imageLink] = line.split("|");
            return { text: (text || "").trim(), imageLink: (imageLink || "").trim() };
          });
          break;
        case "rateMin":
        case "rateMax":
        case "rows":
        case "autoStart":
        case "autoStep":
        case "autoPadding":
        case "repeatMin":
        case "repeatMax":
          field[key] = Number(value);
          break;
        case "repeatable":
          field.repeatable = !!value;
          this.applyTypeDefaults(field);
          break;
        default:
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

    // ------------------------------------------------------------------
    // GRUP FIELD DINAMIS / REPEATER
    // Fitur ergonomis di atas fondasi teknis "panel.repeatable": pilih
    // beberapa field yang sudah ada (di kedalaman APA PUN - level atas
    // maupun child field bersarang) lalu jadikan satu grup berulang (panel
    // baru dengan repeatable:true, field terpilih dipindah jadi
    // children-nya). Lihat createRepeaterGroupFromSelection() untuk
    // bagaimana konflik `visibleIfValue` diselesaikan secara presisi.
    // ------------------------------------------------------------------

    toggleGroupSelectMode(sectionIndex) {
      if (this.groupSelection.sectionIndex === sectionIndex) {
        this.groupSelection = { sectionIndex: null, paths: [], groupName: "", itemLabel: "" };
      } else {
        this.groupSelection = {
          sectionIndex,
          paths: [],
          groupName: "Grup Berulang Baru",
          itemLabel: "Item",
        };
      }
      this.renderBuilderPage();
    }

    toggleFieldForGroupSelection(sectionIndex, path) {
      if (this.groupSelection.sectionIndex !== sectionIndex) return;
      const key = String(path);
      const idx = this.groupSelection.paths.indexOf(key);
      if (idx === -1) {
        this.groupSelection.paths.push(key);
      } else {
        this.groupSelection.paths.splice(idx, 1);
      }
      this.renderBuilderPage();
    }

    updateGroupSelectionMeta(key, value) {
      this.groupSelection[key] = value;
      this.renderBuilderPage();
    }

    // Path-string helpers (path = indeks dash-joined, sama seperti skema
    // getFieldByPath). Dipakai untuk menormalisasi seleksi sebelum
    // dieksekusi - lihat createRepeaterGroupFromSelection().
    isDescendantPath(childPath, ancestorPath) {
      return childPath !== ancestorPath && childPath.indexOf(ancestorPath + "-") === 0;
    }

    comparePaths(a, b) {
      const as = a.split("-").map(Number);
      const bs = b.split("-").map(Number);
      const len = Math.max(as.length, bs.length);
      for (let i = 0; i < len; i += 1) {
        const av = as[i] === undefined ? -1 : as[i];
        const bv = bs[i] === undefined ? -1 : bs[i];
        if (av !== bv) return av - bv;
      }
      return 0;
    }

    createRepeaterGroupFromSelection(sectionIndex) {
      const section =
        this.currentForm && this.currentForm.sections && this.currentForm.sections[sectionIndex];
      if (!section) return;

      const selectedPaths = (this.groupSelection.paths || []).slice();
      if (!selectedPaths.length) {
        showAlert("Pilih minimal 1 field (level atas atau child) yang akan dijadikan grup berulang.");
        return;
      }

      // ------------------------------------------------------------
      // 1) Normalisasi: buang path yang leluhurnya JUGA terpilih. Field
      //    semacam itu tidak perlu (dan tidak boleh) diperlakukan sebagai
      //    "root" independen - ia akan ikut pindah secara utuh sebagai
      //    bagian dari subtree leluhurnya, tetap bersarang dengan induk
      //    aslinya di dalam grup baru, sehingga relasi visibleIfValue-nya
      //    (jika ada, relatif ke induk yang ikut pindah bersamanya) tetap
      //    valid tanpa perlu disentuh sama sekali.
      // ------------------------------------------------------------
      const rootPaths = selectedPaths
        .filter((p) => !selectedPaths.some((other) => other !== p && this.isDescendantPath(p, other)))
        .sort((a, b) => this.comparePaths(a, b));

      const groupName = (this.groupSelection.groupName || "").trim() || "Grup Berulang";
      const itemLabel = (this.groupSelection.itemLabel || "").trim() || "Item";

      // ------------------------------------------------------------
      // 2) Resolusi referensi OBJEK (bukan cuma path) untuk tiap root,
      //    SEBELUM mutasi apa pun terjadi. Karena field & array children
      //    di JS adalah referensi, objek ini tetap valid & bisa dicari
      //    lewat indexOf() apa pun urutan penghapusan lain yang terjadi
      //    di tempat lain pada pohon form - ini yang membuat penghapusan
      //    di langkah 4 presisi walau seleksi bercampur kedalaman.
      // ------------------------------------------------------------
      const rootEntries = rootPaths
        .map((p) => {
          const field = this.getFieldByPath(sectionIndex, p, 0);
          if (!field) return null;
          const segments = p.split("-");
          const parentPath = segments.length > 1 ? segments.slice(0, -1).join("-") : null;
          const parentContainer =
            parentPath === null
              ? section.fields
              : (this.getFieldByPath(sectionIndex, parentPath, 0) || {}).children;
          if (!Array.isArray(parentContainer)) return null;
          return { path: p, field, parentContainer };
        })
        .filter(Boolean);

      if (!rootEntries.length) {
        showAlert("Field yang dipilih tidak valid, coba pilih ulang.");
        return;
      }

      // ------------------------------------------------------------
      // 3) Sisipkan placeholder di posisi field root PERTAMA (level atas)
      //    supaya posisi sisip grup baru presisi walau nanti banyak
      //    penghapusan terjadi di berbagai kedalaman/parent yang
      //    berbeda-beda - placeholder ini ikut bergeser secara alami
      //    mengikuti splice() lain seperti elemen array biasa, lalu
      //    posisinya yang SEBENARNYA (setelah semua penghapusan selesai)
      //    dicari kembali lewat indexOf() di langkah 5.
      // ------------------------------------------------------------
      const anchorTopLevelIndex = Number(rootPaths[0].split("-")[0]);
      const placeholder = { __repeaterGroupPlaceholder: true };
      section.fields.splice(anchorTopLevelIndex, 0, placeholder);

      // ------------------------------------------------------------
      // 4) Keluarkan tiap field root dari lokasi asalnya lewat identitas
      //    objek (bukan indeks numerik basi), lalu selesaikan konflik
      //    visibleIfValue SECARA PRESISI: hanya field root sendiri yang
      //    dilepas relasinya (karena ia berpindah induk, dari apa pun
      //    induk aslinya, menjadi anak langsung panel - yang bukan choice
      //    type). Descendant yang ikut bersamanya (tersaring di langkah 1)
      //    TIDAK disentuh visibleIfValue-nya karena induk langsungnya
      //    tetap sama seperti semula.
      // ------------------------------------------------------------
      const selectedFields = rootEntries.map(({ field, parentContainer }) => {
        const idx = parentContainer.indexOf(field);
        if (idx !== -1) parentContainer.splice(idx, 1);
        if (field && "visibleIfValue" in field) delete field.visibleIfValue;
        return field;
      });

      const panelField = this.createNewField("panel");
      panelField.label = groupName;
      panelField.repeatable = true;
      panelField.repeatMin = 1;
      panelField.repeatMax = 0;
      panelField.repeatItemLabel = itemLabel;
      panelField.children = selectedFields;

      // ------------------------------------------------------------
      // 5) Cari posisi placeholder yang sebenarnya (bisa saja sudah
      //    bergeser akibat penghapusan root level-atas lain) lalu ganti
      //    dengan panel berulang yang baru dibuat.
      // ------------------------------------------------------------
      const placeholderIndex = section.fields.indexOf(placeholder);
      if (placeholderIndex === -1) {
        section.fields.push(panelField);
      } else {
        section.fields.splice(placeholderIndex, 1, panelField);
      }

      this.groupSelection = { sectionIndex: null, paths: [], groupName: "", itemLabel: "" };
      this.renderBuilderPage();
    }

    ungroupRepeaterField(sectionIndex, path, depth) {
      if (!this.currentForm) return;
      const field = this.getFieldByPath(sectionIndex, path, depth);
      if (!field || field.type !== "panel") return;

      const children = Array.isArray(field.children) ? field.children.slice() : [];
      // Field ini kembali jadi sibling biasa di level induknya (yang
      // bukan choice type juga, karena berasal dari dalam panel) -
      // bersihkan visibleIfValue basi yang mungkin masih menempel.
      children.forEach((c) => {
        if (c && "visibleIfValue" in c) delete c.visibleIfValue;
      });

      const indices = String(path).split("-").map(Number);
      if (indices.length === 1) {
        const section = this.currentForm.sections[sectionIndex];
        if (!section) return;
        section.fields.splice(indices[0], 1, ...children);
      } else {
        const parentPath = indices.slice(0, -1).join("-");
        const parent = this.getFieldByPath(sectionIndex, parentPath, depth - 1);
        if (!parent || !Array.isArray(parent.children)) return;
        parent.children.splice(indices[indices.length - 1], 1, ...children);
      }
      this.renderBuilderPage();
    }

    generateBuilderJson() {
      const output = document.getElementById("builder-json-output");
      if (!output || !this.currentForm) return;
      output.textContent = JSON.stringify(this.currentForm, null, 2);
    }

    // ------------------------------------------------------------------
    // PREVIEW (non-interaktif, dipakai di Form Builder untuk pratinjau)
    // ------------------------------------------------------------------
    renderFormPreview(formDef) {
      const html = [`<div class="formgear-form-preview">`];
      html.push(`<h3>${this.escapeHtml(formDef.name || "Form Preview")}</h3>`);
      html.push(
        `<p style="color: var(--text-muted); margin: 0 0 16px;">${this.escapeHtml(formDef.description || "")}</p>`,
      );
      html.push(this.renderPreviewSections(formDef));
      html.push(`</div>`);
      return html.join("");
    }

    renderPreviewSections(formDef) {
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
          return this.renderFieldBlock(field, path, { disabled: true });
        })
        .join("");
    }

    // ------------------------------------------------------------------
    // RENDER FUNGSIONAL (form yang benar-benar bisa diisi & dikirim)
    // ------------------------------------------------------------------
    renderForm(formId, containerId) {
      const formDef = this.getFormDefinition(formId);
      const container = document.getElementById(containerId);
      if (!container) return;
      if (!formDef) {
        container.innerHTML =
          '<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>Form tidak ditemukan.</p></div>';
        return;
      }
      this.fileDataStore = {};
      this.signatureDataStore = {};
      container.innerHTML = this.renderFormContent(formDef);
      this.wireFormFieldEvents(container, formDef);
    }

    renderFormContent(formDef) {
      const html = [`<div class="formgear-form-preview">`];
      html.push(`<h3>${this.escapeHtml(formDef.name || "Form")}</h3>`);
      html.push(
        `<p style="color: var(--text-muted); margin: 0 0 16px;">${this.escapeHtml(formDef.description || "")}</p>`,
      );
      html.push(this.renderFormFields(formDef));
      html.push(
        `<button class="btn-success formgear-submit-button" onclick="FormGearBuilderInstance.submitRenderedForm('${formDef.id}')"><i class="bi bi-send"></i> Kirim Form</button>`,
      );
      html.push(`</div>`);
      return html.join("");
    }

    renderFormFields(formDef) {
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

    renderFormFieldInputs(fields, pathPrefix, parentField) {
      return (fields || [])
        .map((field, fieldIndex) => {
          const path = `${pathPrefix}-${fieldIndex}`;
          return this.renderFieldBlock(field, path, {
            disabled: false,
            parentField: parentField || null,
          });
        })
        .join("");
    }

    // Blok field generik: label + kontrol + anak (children), dipakai baik
    // untuk mode preview (disabled) maupun mode fungsional.
    renderFieldBlock(field, path, opts) {
      const disabled = !!opts.disabled;
      const parentField = opts.parentField || null;
      const name = this.escapeHtml(field.name || "field_" + path);

      if (field.type === "html") {
        return `<div class="html-field-block">${field.html || ""}</div>`;
      }

      if (field.type === "panel") {
        if (field.repeatable) {
          return this.renderRepeaterPanelBlock(field, path, opts);
        }
        return `
                    <div class="panel-field-block">
                        <div class="panel-field-title">${this.escapeHtml(field.label || "Panel")}</div>
                        ${
                          field.children && field.children.length
                            ? `<div class="formgear-builder-children">${
                                disabled
                                  ? this.renderPreviewFields(field.children, path)
                                  : this.renderFormFieldInputs(field.children, path, field)
                              }</div>`
                            : '<p style="color:var(--text-muted); font-size:0.82rem;">Panel kosong.</p>'
                        }
                    </div>
                `;
      }

      const visibleIfAttrs =
        parentField && isChoiceType(parentField.type) && field.visibleIfValue
          ? ` data-visible-if-value="${this.escapeHtml(field.visibleIfValue)}"`
          : "";

      const control = disabled
        ? this.renderPreviewControl(field, path)
        : this.renderInputControl(field, name, path);

      const childrenHtml =
        field.children && field.children.length
          ? `<div class="formgear-builder-children">${
              disabled
                ? this.renderPreviewFields(field.children, path)
                : this.renderFormFieldInputs(field.children, path, field)
            }</div>`
          : "";

      return `
                <div class="field-preview" data-field-key="${path}"${visibleIfAttrs}>
                    <label>${this.escapeHtml(field.label || "Field")}${field.required ? ' <span class="required-badge">*</span>' : ""}</label>
                    ${control}
                    ${childrenHtml}
                    ${!disabled ? `<div class="field-error" data-field-error="${path}"></div>` : ""}
                </div>
            `;
    }

    // ------------------------------------------------------------------
    // GRUP FIELD DINAMIS / REPEATER - rendering
    // Sebuah panel dengan field.repeatable === true dirender sebagai N
    // instance (baris) dari field.children, masing-masing dengan path DOM
    // sendiri (`${panelPath}.${instanceIndex}-${childIndex}`, dipisah "."
    // supaya tidak pernah bertabrakan dengan skema path dash-only yang
    // dipakai builder/getFieldByPath). Di mode preview (disabled) hanya 1
    // contoh baris ditampilkan tanpa kontrol tambah/hapus, karena preview
    // memang non-interaktif.
    // ------------------------------------------------------------------
    renderRepeaterPanelBlock(field, path, opts) {
      const disabled = !!opts.disabled;
      const min = Number.isFinite(field.repeatMin) ? Math.max(0, field.repeatMin) : 1;
      const max = Number.isFinite(field.repeatMax) ? Math.max(0, field.repeatMax) : 0;
      const itemLabel = field.repeatItemLabel || "Item";

      if (disabled) {
        const sampleHtml = this.renderRepeaterInstance(field, path, 0, min, 1, opts);
        return `
                    <div class="panel-field-block repeater-panel-block">
                        <div class="panel-field-title">
                            ${this.escapeHtml(field.label || "Panel")}
                            <span class="repeater-badge"><i class="bi bi-arrow-repeat"></i> Berulang &middot; ${this.escapeHtml(itemLabel)}</span>
                        </div>
                        <p class="field-type-hint"><i class="bi bi-info-circle"></i> Contoh 1 baris. Saat form diisi, pengguna dapat menambah baris "${this.escapeHtml(itemLabel)}" lain.</p>
                        ${
                          field.children && field.children.length
                            ? sampleHtml
                            : '<p style="color:var(--text-muted); font-size:0.82rem;">Grup berulang ini belum punya field.</p>'
                        }
                    </div>
                `;
      }

      const initialCount = Math.max(min, 1);
      const instancesHtml = this.renderRepeaterInstances(field, path, initialCount, opts);

      return `
                <div class="panel-field-block repeater-panel-block field-preview" data-field-key="${path}" data-repeater-path="${path}" data-repeater-min="${min}" data-repeater-max="${max}">
                    <div class="panel-field-title">
                        ${this.escapeHtml(field.label || "Panel")}
                        <span class="repeater-badge"><i class="bi bi-arrow-repeat"></i> Berulang</span>
                    </div>
                    <div class="repeater-instances" data-repeater-instances="${path}">
                        ${instancesHtml}
                    </div>
                    <button type="button" class="btn-outline repeater-add-btn" style="width:auto;" data-repeater-add="${path}"><i class="bi bi-plus-lg"></i> Tambah ${this.escapeHtml(itemLabel)}</button>
                    <div class="field-error" data-field-error="${path}"></div>
                </div>
            `;
    }

    renderRepeaterInstances(field, path, count, opts) {
      const min = Number.isFinite(field.repeatMin) ? Math.max(0, field.repeatMin) : 1;
      const html = [];
      for (let i = 0; i < count; i += 1) {
        html.push(this.renderRepeaterInstance(field, path, i, min, count, opts));
      }
      return html.join("");
    }

    renderRepeaterInstance(field, path, instanceIndex, min, currentCount, opts) {
      const disabled = !!opts.disabled;
      const instancePath = `${path}.${instanceIndex}`;
      const itemLabel = this.escapeHtml(field.repeatItemLabel || "Item");
      const childrenHtml =
        field.children && field.children.length
          ? disabled
            ? this.renderPreviewFields(field.children, instancePath)
            : this.renderFormFieldInputs(field.children, instancePath, field)
          : '<p style="color:var(--text-muted); font-size:0.82rem;">Belum ada field di dalam grup ini.</p>';

      const removeBtn = disabled
        ? ""
        : `<button type="button" class="btn-danger repeater-remove-btn" style="width:auto; margin-top:0;" data-repeater-remove="${path}" data-instance-index="${instanceIndex}" ${currentCount <= min ? "disabled" : ""}><i class="bi bi-trash3"></i> Hapus</button>`;

      return `
                <div class="repeater-instance" data-repeater-instance="${path}" data-instance-index="${instanceIndex}">
                    <div class="repeater-instance-header">
                        <span class="repeater-instance-label">${itemLabel} #${instanceIndex + 1}</span>
                        ${removeBtn}
                    </div>
                    <div class="formgear-builder-children">${childrenHtml}</div>
                </div>
            `;
    }

    // Kontrol non-interaktif untuk mode preview.
    renderPreviewControl(field, path) {
      switch (field.type) {
        case "comment":
          return `<textarea placeholder="${this.escapeHtml(field.placeholder || "")}" disabled></textarea>`;
        case "text":
          return `<input type="${field.inputType || "text"}" placeholder="${this.escapeHtml(field.placeholder || "")}" disabled>`;
        case "dropdown":
          return `<select disabled>${(field.options || []).map((o) => `<option>${this.escapeHtml(o)}</option>`).join("")}</select>`;
        case "radiogroup":
        case "checkbox":
          return `<div class="choice-list">${(field.options || [])
            .map(
              (o) =>
                `<label class="choice-item"><input type="${field.type === "checkbox" ? "checkbox" : "radio"}" disabled> <span>${this.escapeHtml(o)}</span></label>`,
            )
            .join("")}</div>`;
        case "tagbox":
          return `<div class="tagbox-list">${(field.options || []).map((o) => `<span class="tag-chip">${this.escapeHtml(o)}</span>`).join("")}</div>`;
        case "boolean":
          return `<div class="bool-toggle-wrap"><button type="button" class="bool-btn" disabled>${this.escapeHtml(field.labelFalse || "Tidak")}</button><button type="button" class="bool-btn" disabled>${this.escapeHtml(field.labelTrue || "Ya")}</button></div>`;
        case "rating": {
          const min = field.rateMin ?? 1;
          const max = field.rateMax ?? 5;
          const buttons = [];
          for (let n = min; n <= max; n += 1) buttons.push(`<button type="button" class="rating-btn" disabled>${n}</button>`);
          return `<div class="rating-control">${buttons.join("")}</div>`;
        }
        case "ranking":
          return `<ul class="ranking-list">${(field.options || [])
            .map((o, i) => `<li class="ranking-item"><span class="ranking-index">${i + 1}</span><span class="ranking-text">${this.escapeHtml(o)}</span></li>`)
            .join("")}</ul>`;
        case "imagepicker":
          return `<div class="imagepicker-grid">${(field.imageOptions || [])
            .map(
              (o) =>
                `<div class="imagepicker-item">${o.imageLink ? `<img src="${this.escapeHtml(o.imageLink)}" alt="${this.escapeHtml(o.text)}">` : `<div class="imagepicker-placeholder"><i class="bi bi-image"></i></div>`}<span>${this.escapeHtml(o.text)}</span></div>`,
            )
            .join("")}</div>`;
        case "file":
          return `<div class="file-upload-control"><input type="file" disabled></div>`;
        case "matrix":
          return this.buildMatrixTable(field, path, true);
        case "signaturepad":
          return `<div class="signature-control"><canvas class="signature-canvas" width="360" height="140"></canvas></div>`;
        case "number":
          return `<input type="number" placeholder="${this.escapeHtml(field.placeholder || "")}" disabled>`;
        case "autonumber":
          return `<input type="text" class="computed-field-input" value="${this.escapeHtml(this.formatAutoNumber(field, Number(field.autoStart) || 1))}" disabled><p class="field-type-hint"><i class="bi bi-magic"></i> Terisi otomatis (auto-increment)</p>`;
        case "customjs":
          return `<input type="text" class="computed-field-input" value="(dihitung otomatis oleh JS)" disabled><p class="field-type-hint"><i class="bi bi-code-slash"></i> Kolom hasil logika bisnis JS</p>`;
        default:
          return `<input type="text" placeholder="${this.escapeHtml(field.placeholder || "")}" disabled>`;
      }
    }

    // Kontrol interaktif (mode fungsional): setiap tipe field punya markup
    // & perilaku data yang sesuai dengan tipe pertanyaan SurveyJS terkait.
    renderInputControl(field, name, path) {
      const ph = this.escapeHtml(field.placeholder || "");
      switch (field.type) {
        case "text":
          return `<input type="${field.inputType || "text"}" data-field-name="${name}" data-field-path="${path}" data-field-type="text" placeholder="${ph}">`;

        case "comment":
          return `<textarea rows="${field.rows || 4}" data-field-name="${name}" data-field-path="${path}" data-field-type="comment" placeholder="${ph}"></textarea>`;

        case "dropdown": {
          const options = (field.options || [])
            .map((o) => `<option value="${this.escapeHtml(o)}">${this.escapeHtml(o)}</option>`)
            .join("");
          return `<select data-field-name="${name}" data-field-path="${path}" data-field-type="dropdown"><option value="">-- pilih --</option>${options}</select>`;
        }

        case "radiogroup": {
          const cls = field.orientation === "horizontal" ? "choice-list horizontal" : "choice-list";
          const options = (field.options || [])
            .map(
              (o) =>
                `<label class="choice-item"><input type="radio" name="radio-${path}" value="${this.escapeHtml(o)}"> <span>${this.escapeHtml(o)}</span></label>`,
            )
            .join("");
          return `<div class="${cls}" data-field-path="${path}" data-field-type="radiogroup">${options}</div>`;
        }

        case "checkbox": {
          const cls = field.orientation === "horizontal" ? "choice-list horizontal" : "choice-list";
          const options = (field.options || [])
            .map(
              (o) =>
                `<label class="choice-item"><input type="checkbox" value="${this.escapeHtml(o)}"> <span>${this.escapeHtml(o)}</span></label>`,
            )
            .join("");
          return `<div class="${cls}" data-field-path="${path}" data-field-type="checkbox">${options}</div>`;
        }

        case "tagbox": {
          const options = (field.options || [])
            .map((o) => `<button type="button" class="tag-chip" data-value="${this.escapeHtml(o)}">${this.escapeHtml(o)}</button>`)
            .join("");
          return `<div class="tagbox-list" data-field-path="${path}" data-field-type="tagbox">${options}</div>`;
        }

        case "boolean": {
          const labelFalse = this.escapeHtml(field.labelFalse || "Tidak");
          const labelTrue = this.escapeHtml(field.labelTrue || "Ya");
          return `
                        <div class="bool-toggle-wrap" data-field-path="${path}" data-field-type="boolean">
                            <button type="button" class="bool-btn" data-value="false">${labelFalse}</button>
                            <button type="button" class="bool-btn" data-value="true">${labelTrue}</button>
                        </div>
                    `;
        }

        case "rating": {
          const min = field.rateMin ?? 1;
          const max = field.rateMax ?? 5;
          const buttons = [];
          for (let n = min; n <= max; n += 1) {
            buttons.push(`<button type="button" class="rating-btn" data-value="${n}">${n}</button>`);
          }
          return `<div class="rating-control" data-field-path="${path}" data-field-type="rating">${buttons.join("")}</div>`;
        }

        case "ranking": {
          const items = (field.options || [])
            .map(
              (o, i) => `
                        <li class="ranking-item" data-value="${this.escapeHtml(o)}">
                            <span class="ranking-index">${i + 1}</span>
                            <span class="ranking-text">${this.escapeHtml(o)}</span>
                            <span class="ranking-controls">
                                <button type="button" class="ranking-up" title="Naik"><i class="bi bi-arrow-up"></i></button>
                                <button type="button" class="ranking-down" title="Turun"><i class="bi bi-arrow-down"></i></button>
                            </span>
                        </li>
                    `,
            )
            .join("");
          return `<ul class="ranking-list" data-field-path="${path}" data-field-type="ranking">${items}</ul>`;
        }

        case "imagepicker": {
          const items = (field.imageOptions || [])
            .map(
              (o) => `
                        <button type="button" class="imagepicker-item" data-value="${this.escapeHtml(o.text)}">
                            ${o.imageLink ? `<img src="${this.escapeHtml(o.imageLink)}" alt="${this.escapeHtml(o.text)}">` : `<div class="imagepicker-placeholder"><i class="bi bi-image"></i></div>`}
                            <span>${this.escapeHtml(o.text)}</span>
                        </button>
                    `,
            )
            .join("");
          return `<div class="imagepicker-grid" data-field-path="${path}" data-field-type="imagepicker">${items}</div>`;
        }

        case "file": {
          return `
                        <div class="file-upload-control" data-field-path="${path}" data-field-type="file">
                            <input type="file" ${field.allowMultiple ? "multiple" : ""} accept="${this.escapeHtml(field.acceptTypes || "")}" data-file-input="${path}">
                            <div class="file-preview-list" data-file-preview="${path}"></div>
                        </div>
                    `;
        }

        case "matrix":
          return this.buildMatrixTable(field, path, false);

        case "signaturepad":
          return `
                        <div class="signature-control" data-field-path="${path}" data-field-type="signaturepad">
                            <canvas class="signature-canvas" data-signature-canvas="${path}" width="360" height="140"></canvas>
                            <div class="signature-actions">
                                <button type="button" class="btn-outline signature-clear" data-signature-clear="${path}"><i class="bi bi-eraser"></i> Hapus Tanda Tangan</button>
                            </div>
                        </div>
                    `;

        case "number":
          return `<input type="number" data-field-name="${name}" data-field-path="${path}" data-field-type="text" placeholder="${ph}">`;

        case "autonumber":
          return `<input type="text" class="computed-field-input" data-field-name="${name}" data-field-path="${path}" data-field-type="autonumber" readonly>`;

        case "customjs":
          return `<input type="text" class="computed-field-input" data-field-name="${name}" data-field-path="${path}" data-field-type="customjs" readonly>`;

        default:
          return `<input type="text" data-field-name="${name}" data-field-path="${path}" data-field-type="text" placeholder="${ph}">`;
      }
    }

    buildMatrixTable(field, path, disabled) {
      const rows = field.rows || [];
      const columns = field.columns || [];
      const head = `<tr><th></th>${columns.map((c) => `<th>${this.escapeHtml(c)}</th>`).join("")}</tr>`;
      const body = rows
        .map(
          (r, ri) => `
                <tr data-row="${this.escapeHtml(r)}">
                    <td>${this.escapeHtml(r)}</td>
                    ${columns
                      .map(
                        (c) =>
                          `<td><input type="radio" name="matrix-${path}-${ri}" value="${this.escapeHtml(c)}" ${disabled ? "disabled" : ""}></td>`,
                      )
                      .join("")}
                </tr>
            `,
        )
        .join("");
      return `<div class="matrix-control" data-field-path="${path}" data-field-type="matrix"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    }

    // ------------------------------------------------------------------
    // Interaksi runtime: rating, ranking, boolean, tagbox, imagepicker,
    // file upload (async), signature pad (canvas), dan visibilitas
    // kondisional (visibleIf sederhana).
    // ------------------------------------------------------------------
    wireFormFieldEvents(container, formDef) {
      // Kontrol berbasis tombol/canvas yang butuh addEventListener per
      // elemen (bukan cuma delegasi) -- dipisah ke wireControlWidgets()
      // supaya bisa dipanggil ulang untuk instance repeater baru yang
      // ditambahkan belakangan (lihat addRepeaterInstance()).
      this.wireControlWidgets(container, container, formDef);

      // Radio / checkbox / dropdown / text change -> re-evaluasi visibilitas
      // & kolom terhitung (autonumber/customjs). Didelegasikan ke container
      // sehingga otomatis berlaku juga untuk elemen yang ditambahkan
      // belakangan (misal baris baru pada grup berulang / repeater).
      container.addEventListener("change", (e) => {
        this.clearFieldError(container, e.target && e.target.closest(".field-preview[data-field-key]"));
        this.refreshFormState(container, formDef);
      });

      // Input langsung (mengetik) -> kolom customjs ikut ter-update secara
      // live, bukan hanya saat blur/change; juga langsung menghapus tanda
      // error merah begitu pengguna mulai memperbaiki isian.
      container.addEventListener("input", (e) => {
        this.clearFieldError(container, e.target && e.target.closest(".field-preview[data-field-key]"));
        if (e.target && e.target.dataset && e.target.dataset.fieldType === "customjs") return;
        this.recalculateComputedFields(container, formDef);
      });

      // Kontrol berbasis tombol (rating, boolean, tagbox, imagepicker,
      // ranking) tidak selalu memicu event change/input native, jadi error
      // dibersihkan lewat delegasi klik di sini.
      container.addEventListener("click", (e) => {
        this.clearFieldError(container, e.target && e.target.closest(".field-preview[data-field-key]"));
      });

      // Grup Field Dinamis / Repeater: tambah & hapus baris/instance.
      // Didelegasikan ke container (bukan per-elemen) karena tombol
      // "Tambah" & "Hapus" bisa muncul kapan saja seiring baris baru
      // ditambahkan.
      container.addEventListener("click", (e) => {
        const addBtn = e.target.closest("[data-repeater-add]");
        if (addBtn) {
          this.addRepeaterInstance(container, formDef, addBtn.dataset.repeaterAdd);
          return;
        }
        const removeBtn = e.target.closest("[data-repeater-remove]");
        if (removeBtn) {
          this.removeRepeaterInstance(
            container,
            formDef,
            removeBtn.dataset.repeaterRemove,
            Number(removeBtn.dataset.instanceIndex),
          );
        }
      });

      // Evaluasi awal visibilitas kondisional + kolom terhitung
      this.refreshFormState(container, formDef);
    }

    // Wiring untuk kontrol yang butuh addEventListener langsung per elemen
    // (bukan delegasi ke container): rating, boolean, tagbox, imagepicker,
    // ranking, file upload, signature pad. Menerima `scopeEl` terpisah dari
    // `container` supaya bisa dipanggil ulang hanya untuk sub-tree DOM baru
    // (misal satu baris repeater yang baru ditambahkan) tanpa mengulang
    // wiring elemen yang sudah ada. Ditandai `dataset.wired` sebagai
    // pengaman terhadap pemanggilan ganda pada elemen yang sama.
    wireControlWidgets(scopeEl, container, formDef) {
      scopeEl.querySelectorAll('[data-field-type="rating"]').forEach((el) => {
        if (el.dataset.repeaterWired === "1") return;
        el.dataset.repeaterWired = "1";
        el.addEventListener("click", (e) => {
          const btn = e.target.closest(".rating-btn");
          if (!btn) return;
          el.querySelectorAll(".rating-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.refreshFormState(container, formDef);
        });
      });

      scopeEl.querySelectorAll('[data-field-type="boolean"]').forEach((el) => {
        if (el.dataset.repeaterWired === "1") return;
        el.dataset.repeaterWired = "1";
        el.addEventListener("click", (e) => {
          const btn = e.target.closest(".bool-btn");
          if (!btn) return;
          el.querySelectorAll(".bool-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.refreshFormState(container, formDef);
        });
      });

      scopeEl.querySelectorAll('[data-field-type="tagbox"]').forEach((el) => {
        if (el.dataset.repeaterWired === "1") return;
        el.dataset.repeaterWired = "1";
        el.addEventListener("click", (e) => {
          const chip = e.target.closest(".tag-chip");
          if (!chip) return;
          chip.classList.toggle("active");
          this.refreshFormState(container, formDef);
        });
      });

      scopeEl.querySelectorAll('[data-field-type="imagepicker"]').forEach((el) => {
        if (el.dataset.repeaterWired === "1") return;
        el.dataset.repeaterWired = "1";
        el.addEventListener("click", (e) => {
          const item = e.target.closest(".imagepicker-item");
          if (!item) return;
          el.querySelectorAll(".imagepicker-item").forEach((b) => b.classList.remove("active"));
          item.classList.add("active");
          this.refreshFormState(container, formDef);
        });
      });

      scopeEl.querySelectorAll('[data-field-type="ranking"]').forEach((el) => {
        if (el.dataset.repeaterWired === "1") return;
        el.dataset.repeaterWired = "1";
        el.addEventListener("click", (e) => {
          const upBtn = e.target.closest(".ranking-up");
          const downBtn = e.target.closest(".ranking-down");
          if (!upBtn && !downBtn) return;
          const li = e.target.closest(".ranking-item");
          if (!li) return;
          if (upBtn && li.previousElementSibling) {
            el.insertBefore(li, li.previousElementSibling);
          } else if (downBtn && li.nextElementSibling) {
            el.insertBefore(li.nextElementSibling, li);
          }
          el.querySelectorAll(".ranking-item").forEach((item, idx) => {
            const indexEl = item.querySelector(".ranking-index");
            if (indexEl) indexEl.textContent = String(idx + 1);
          });
          this.refreshFormState(container, formDef);
        });
      });

      // File upload (async, dibaca sebagai base64)
      scopeEl.querySelectorAll("[data-file-input]").forEach((input) => {
        if (input.dataset.repeaterWired === "1") return;
        input.dataset.repeaterWired = "1";
        input.addEventListener("change", (e) => {
          const path = input.dataset.fileInput;
          const files = Array.from(e.target.files || []);
          const previewList = container.querySelector(`[data-file-preview="${path}"]`);
          this.fileDataStore[path] = [];
          if (previewList) previewList.innerHTML = "";
          files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = () => {
              this.fileDataStore[path].push({
                name: file.name,
                type: file.type,
                size: file.size,
                dataUrl: reader.result,
              });
              if (previewList) {
                const item = document.createElement("div");
                item.className = "file-preview-item";
                item.innerHTML = `<i class="bi bi-file-earmark-check"></i> ${this.escapeHtml(file.name)}`;
                previewList.appendChild(item);
              }
            };
            reader.readAsDataURL(file);
          });
        });
      });

      // Signature pad (canvas menggambar dengan pointer events)
      scopeEl.querySelectorAll("[data-signature-canvas]").forEach((canvas) => {
        if (canvas.dataset.repeaterWired === "1") return;
        canvas.dataset.repeaterWired = "1";
        const path = canvas.dataset.signatureCanvas;
        const ctx = canvas.getContext("2d");
        ctx.strokeStyle = "#f1f5f9";
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        let drawing = false;

        const getPos = (evt) => {
          const rect = canvas.getBoundingClientRect();
          return {
            x: (evt.clientX - rect.left) * (canvas.width / rect.width),
            y: (evt.clientY - rect.top) * (canvas.height / rect.height),
          };
        };

        canvas.addEventListener("pointerdown", (evt) => {
          drawing = true;
          const pos = getPos(evt);
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
        });
        canvas.addEventListener("pointermove", (evt) => {
          if (!drawing) return;
          const pos = getPos(evt);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        });
        const endStroke = () => {
          if (!drawing) return;
          drawing = false;
          this.signatureDataStore[path] = canvas.toDataURL("image/png");
        };
        canvas.addEventListener("pointerup", endStroke);
        canvas.addEventListener("pointerleave", endStroke);
      });

      scopeEl.querySelectorAll("[data-signature-clear]").forEach((btn) => {
        if (btn.dataset.repeaterWired === "1") return;
        btn.dataset.repeaterWired = "1";
        btn.addEventListener("click", () => {
          const path = btn.dataset.signatureClear;
          const canvas = container.querySelector(`[data-signature-canvas="${path}"]`);
          if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
          delete this.signatureDataStore[path];
        });
      });
    }

    // ------------------------------------------------------------------
    // GRUP FIELD DINAMIS / REPEATER - interaksi runtime (tambah/hapus baris)
    // ------------------------------------------------------------------

    // Mencari definisi field lewat path DOM-nya sendiri (dash-only, sama
    // seperti path panel/repeater itu sendiri -- BUKAN path instance yang
    // memakai "."). Dipakai saat runtime (mode isi form), berbeda dari
    // getFieldByPath() milik builder yang beroperasi atas this.currentForm.
    getFieldByRuntimePath(formDef, dashPath) {
      const segments = String(dashPath).split("-").map(Number);
      const section = formDef.sections && formDef.sections[segments[0]];
      if (!section) return null;
      let field = section.fields && section.fields[segments[1]];
      for (let i = 2; i < segments.length; i += 1) {
        if (!field || !Array.isArray(field.children)) return null;
        field = field.children[segments[i]];
      }
      return field || null;
    }

    addRepeaterInstance(container, formDef, path) {
      const field = this.getFieldByRuntimePath(formDef, path);
      if (!field || !field.repeatable) return;
      const instancesEl = container.querySelector(`[data-repeater-instances="${path}"]`);
      if (!instancesEl) return;

      const existingItems = Array.from(instancesEl.querySelectorAll(".repeater-instance"));
      const max = Number.isFinite(field.repeatMax) ? Math.max(0, field.repeatMax) : 0;
      if (max > 0 && existingItems.length >= max) {
        showAlert(`Maksimal ${max} ${field.repeatItemLabel || "item"} untuk grup ini.`);
        return;
      }

      const min = Number.isFinite(field.repeatMin) ? Math.max(0, field.repeatMin) : 1;
      // Indeks baru = indeks tertinggi yang pernah dipakai + 1 (bukan
      // sekadar jumlah instance saat ini), supaya tidak bertabrakan dengan
      // instance yang masih ada setelah ada penghapusan di tengah (lihat
      // catatan "tanpa reindex" pada removeRepeaterInstance()).
      const existingIndices = existingItems.map((el) => Number(el.dataset.instanceIndex));
      const newIndex = existingIndices.length ? Math.max(...existingIndices) + 1 : 0;

      const wrapper = document.createElement("div");
      wrapper.innerHTML = this.renderRepeaterInstance(field, path, newIndex, min, existingItems.length + 1, {
        disabled: false,
      }).trim();
      const newEl = wrapper.firstElementChild;
      if (!newEl) return;
      instancesEl.appendChild(newEl);

      this.wireControlWidgets(newEl, container, formDef);
      this.updateRepeaterRemoveButtons(instancesEl, min);
      this.relabelRepeaterInstances(instancesEl, field.repeatItemLabel || "Item");
      this.refreshFormState(container, formDef);
    }

    removeRepeaterInstance(container, formDef, path, instanceIndex) {
      const field = this.getFieldByRuntimePath(formDef, path);
      if (!field || !field.repeatable) return;
      const instancesEl = container.querySelector(`[data-repeater-instances="${path}"]`);
      if (!instancesEl) return;

      const currentCount = instancesEl.querySelectorAll(".repeater-instance").length;
      const min = Number.isFinite(field.repeatMin) ? Math.max(0, field.repeatMin) : 1;
      if (currentCount <= min) {
        showAlert(`Minimal ${min} ${field.repeatItemLabel || "item"} harus ada pada grup ini.`);
        return;
      }

      const target = instancesEl.querySelector(`.repeater-instance[data-instance-index="${instanceIndex}"]`);
      if (target) target.remove();

      // Bersihkan data file/tanda-tangan milik instance yang dihapus
      // (tersimpan di this.fileDataStore/this.signatureDataStore, bukan di
      // DOM) supaya tidak tersisa sebagai data "hantu" saat submit.
      const instancePrefix = `${path}.${instanceIndex}-`;
      Object.keys(this.fileDataStore).forEach((key) => {
        if (key.indexOf(instancePrefix) === 0) delete this.fileDataStore[key];
      });
      Object.keys(this.signatureDataStore).forEach((key) => {
        if (key.indexOf(instancePrefix) === 0) delete this.signatureDataStore[key];
      });

      this.updateRepeaterRemoveButtons(instancesEl, min);
      this.relabelRepeaterInstances(instancesEl, field.repeatItemLabel || "Item");
      this.refreshFormState(container, formDef);
    }

    updateRepeaterRemoveButtons(instancesEl, min) {
      const items = instancesEl.querySelectorAll(".repeater-instance");
      items.forEach((el) => {
        const btn = el.querySelector(".repeater-remove-btn");
        if (btn) btn.disabled = items.length <= min;
      });
    }

    // Perbarui nomor tampilan "#1, #2, ..." pada tiap instance yang masih
    // ada -- kosmetik saja, TIDAK mengubah data-instance-index/path yang
    // dipakai sebagai kunci data (lihat catatan di removeRepeaterInstance).
    relabelRepeaterInstances(instancesEl, itemLabel) {
      const items = instancesEl.querySelectorAll(".repeater-instance");
      items.forEach((el, displayIndex) => {
        const labelEl = el.querySelector(".repeater-instance-label");
        if (labelEl) labelEl.textContent = `${itemLabel} #${displayIndex + 1}`;
      });
    }

    // Membaca nilai satu field langsung dari elemen DOM-nya berdasarkan tipe.
    getFieldDomValue(container, field, path) {
      switch (field.type) {
        case "text":
        case "comment": {
          const el = container.querySelector(`[data-field-path="${path}"]`);
          return el ? el.value : "";
        }
        case "dropdown": {
          const el = container.querySelector(`[data-field-path="${path}"]`);
          return el ? el.value : "";
        }
        case "radiogroup": {
          const checked = container.querySelector(`[data-field-path="${path}"] input[type="radio"]:checked`);
          return checked ? checked.value : "";
        }
        case "checkbox": {
          const checked = container.querySelectorAll(`[data-field-path="${path}"] input[type="checkbox"]:checked`);
          return Array.from(checked).map((el) => el.value);
        }
        case "tagbox": {
          const active = container.querySelectorAll(`[data-field-path="${path}"] .tag-chip.active`);
          return Array.from(active).map((el) => el.dataset.value);
        }
        case "boolean": {
          const wrap = container.querySelector(`[data-field-path="${path}"]`);
          const active = wrap ? wrap.querySelector(".bool-btn.active") : null;
          return active ? active.dataset.value === "true" : null;
        }
        case "rating": {
          const wrap = container.querySelector(`[data-field-path="${path}"]`);
          const active = wrap ? wrap.querySelector(".rating-btn.active") : null;
          return active ? Number(active.dataset.value) : null;
        }
        case "ranking": {
          const wrap = container.querySelector(`[data-field-path="${path}"]`);
          if (!wrap) return [];
          return Array.from(wrap.querySelectorAll(".ranking-item")).map((li) => li.dataset.value);
        }
        case "imagepicker": {
          const wrap = container.querySelector(`[data-field-path="${path}"]`);
          const active = wrap ? wrap.querySelector(".imagepicker-item.active") : null;
          return active ? active.dataset.value : "";
        }
        case "matrix": {
          const wrap = container.querySelector(`[data-field-path="${path}"]`);
          if (!wrap) return {};
          const result = {};
          wrap.querySelectorAll("tbody tr").forEach((tr) => {
            const rowLabel = tr.dataset.row;
            const checked = tr.querySelector("input[type=radio]:checked");
            result[rowLabel] = checked ? checked.value : null;
          });
          return result;
        }
        case "file":
          return this.fileDataStore[path] || [];
        case "signaturepad":
          return this.signatureDataStore[path] || "";
        case "autonumber":
        case "customjs": {
          const el = container.querySelector(`[data-field-path="${path}"]`);
          return el ? el.value : "";
        }
        default:
          return "";
      }
    }

    isFieldValueEmpty(field, value) {
      if (value === null || value === undefined) return true;
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === "object") return Object.keys(value).length === 0 || Object.values(value).every((v) => !v);
      if (typeof value === "boolean") return false; // jawaban Ya/Tidak eksplisit dianggap terisi
      return String(value).trim() === "";
    }

    // Validasi format nilai (bukan validasi "wajib diisi", yang ditangani
    // terpisah di collectSubmissionData). Hanya berjalan saat nilai TIDAK
    // kosong, sehingga field opsional yang dikosongkan tetap lolos. Semua
    // pesan dalam Bahasa Indonesia agar konsisten dengan seluruh UI.
    validateFieldFormat(field, value) {
      if (this.isFieldValueEmpty(field, value)) return null;
      const str = typeof value === "string" ? value.trim() : value;

      if (field.type === "text") {
        switch (field.inputType) {
          case "email": {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!re.test(String(str))) return "Format email tidak valid.";
            break;
          }
          case "tel": {
            const digits = String(str).replace(/[^0-9]/g, "");
            if (digits.length < 8 || digits.length > 15) {
              return "Nomor telepon harus berisi 8-15 digit angka.";
            }
            break;
          }
          case "url": {
            const re = /^https?:\/\/[^\s]+\.[^\s]+/i;
            if (!re.test(String(str))) return "Format URL tidak valid (harus diawali http:// atau https://).";
            break;
          }
          case "number": {
            if (!Number.isFinite(Number(str)) || String(str).trim() === "") return "Nilai harus berupa angka.";
            break;
          }
          default:
            break;
        }
      }

      if (field.type === "number") {
        if (!Number.isFinite(Number(str)) || String(str).trim() === "") return "Nilai harus berupa angka.";
      }

      return null;
    }

    // Menentukan apakah sebuah field (anak) sedang terlihat berdasarkan
    // nilai induknya saat ini (visibleIf sederhana: kesetaraan nilai).
    fieldMatchesVisibleIf(field, parentValue) {
      if (!field.visibleIfValue) return true;
      if (Array.isArray(parentValue)) return parentValue.includes(field.visibleIfValue);
      return parentValue === field.visibleIfValue;
    }

    updateConditionalVisibility(container, formDef) {
      const walk = (fields, pathPrefix, parentField, parentValue) => {
        (fields || []).forEach((field, idx) => {
          const path = `${pathPrefix}-${idx}`;
          const wrapper = container.querySelector(`[data-field-key="${path}"]`);
          let visible = true;
          if (parentField && isChoiceType(parentField.type) && field.visibleIfValue) {
            visible = this.fieldMatchesVisibleIf(field, parentValue);
          }
          if (wrapper) {
            wrapper.style.display = visible ? "" : "none";
          }

          if (field.type === "panel" && field.repeatable) {
            // Grup berulang: setiap baris/instance punya nilai field
            // sendiri-sendiri, jadi visibilitas kondisional anak-anaknya
            // (misal dropdown -> field lain di baris yang sama) harus
            // dievaluasi per-instance, bukan sekali untuk seluruh grup.
            const instancesEl = container.querySelector(`[data-repeater-instances="${path}"]`);
            if (instancesEl) {
              instancesEl.querySelectorAll(".repeater-instance").forEach((instanceEl) => {
                const instanceIndex = instanceEl.dataset.instanceIndex;
                walk(field.children || [], `${path}.${instanceIndex}`, null, null);
              });
            }
            return;
          }

          if (field.children && field.children.length) {
            const currentValue = this.getFieldDomValue(container, field, path);
            walk(field.children, path, field, currentValue);
          }
        });
      };

      (formDef.sections || []).forEach((section, sIdx) => {
        walk(section.fields || [], `${sIdx}`, null, null);
      });
    }

    // ------------------------------------------------------------------
    // KOLOM TERHITUNG (business logic): Auto Number & Custom JS Column.
    // Nilainya tidak diketik manual oleh pengisi form, melainkan dihitung
    // ulang otomatis setiap kali data field lain berubah.
    // ------------------------------------------------------------------

    formatAutoNumber(field, seq) {
      const padding = Number(field.autoPadding) || 0;
      const numStr =
        padding > 0 ? String(Math.max(0, seq)).padStart(padding, "0") : String(seq);
      return (field.autoPrefix || "") + numStr;
    }

    // Urutan berikutnya = titik awal + (jumlah submission form ini yang
    // sudah tersimpan lokal) * step. Dihitung sekali saat field pertama
    // kali dirender lalu "dikunci" (data-auto-assigned) agar tidak
    // berubah-ubah setiap kali form lain di halaman yang sama berubah.
    getNextAutoNumberSeq(field, formId) {
      const start = Number.isFinite(field.autoStart) ? field.autoStart : 1;
      const step = Number.isFinite(field.autoStep) ? field.autoStep : 1;
      let count = 0;
      try {
        const subs = JSON.parse(localStorage.getItem(STORAGE_SUBMISSIONS) || "[]");
        if (formId) {
          count = subs.filter((s) => s.formId === formId).length;
        }
      } catch (error) {
        count = 0;
      }
      return start + count * step;
    }

    // Mengeksekusi kode JS milik field bertipe "customjs". TIDAK di-sandbox
    // (berjalan di context halaman via `new Function`) -- sesuai desain
    // "local-first, zero-backend" aplikasi ini, ini adalah trade-off yang
    // disengaja, bukan kelalaian. Jangan pernah kirim data hasil eksekusi
    // ini ke pihak ketiga tanpa sepengetahuan pengguna.
    runCustomJsField(field, data) {
      try {
        const utils = {
          toNumber: (v) => {
            const n = parseFloat(v);
            return isNaN(n) ? 0 : n;
          },
          sum: function () {
            return Array.prototype.slice
              .call(arguments)
              .reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
          },
          avg: function () {
            const args = Array.prototype.slice.call(arguments);
            if (!args.length) return 0;
            return utils.sum.apply(null, args) / args.length;
          },
          today: () => new Date().toISOString().slice(0, 10),
        };
        // eslint-disable-next-line no-new-func
        const fn = new Function("data", "utils", field.jsCode || "return '';");
        return { value: fn(data, utils) };
      } catch (error) {
        return { error: (error && error.message) || String(error) };
      }
    }

    // Mengumpulkan nilai SEMUA field (terlepas dari visibilitas kondisional)
    // dari DOM saat ini, dipakai sebagai variabel `data` untuk kode
    // customjs -- berbeda dari collectSubmissionData() yang memvalidasi
    // dan hanya menyertakan field yang sedang tampil.
    // Catatan keterbatasan (konsisten dengan gaya dokumentasi keterbatasan
    // lain di file ini): field di dalam grup berulang (repeater) SENGAJA
    // tidak disertakan di sini karena satu field bisa punya banyak nilai
    // (satu per instance/baris) sehingga tidak bisa direpresentasikan
    // sebagai satu `data.<nama>` tunggal untuk kode customjs. Custom JS
    // Column & Auto Number hanya "melihat" field level atas / di luar
    // grup berulang.
    collectAllFieldValues(container, formDef) {
      const data = {};
      const walk = (fields, pathPrefix) => {
        (fields || []).forEach((field, idx) => {
          const path = `${pathPrefix}-${idx}`;
          if (field.type !== "html" && field.type !== "panel") {
            const key = field.name || "field_" + path;
            data[key] = this.getFieldDomValue(container, field, path);
          }
          if (field.children && field.children.length && !field.repeatable) {
            walk(field.children, path);
          }
        });
      };
      (formDef.sections || []).forEach((section, sIdx) => {
        walk(section.fields || [], `${sIdx}`);
      });
      return data;
    }

    // Menghitung ulang & menuliskan nilai semua field autonumber/customjs
    // ke DOM masing-masing. Dipanggil setiap kali ada perubahan input di
    // dalam form (lihat wireFormFieldEvents / refreshFormState).
    recalculateComputedFields(container, formDef) {
      const data = this.collectAllFieldValues(container, formDef);
      const walk = (fields, pathPrefix) => {
        (fields || []).forEach((field, idx) => {
          const path = `${pathPrefix}-${idx}`;
          const el = container.querySelector(`[data-field-path="${path}"]`);
          if (el) {
            if (field.type === "customjs") {
              const result = this.runCustomJsField(field, data);
              if (result.error) {
                el.classList.add("customjs-error");
                el.title = "Error pada kode JS: " + result.error;
                if (el.value !== "") el.value = "";
                data[field.name || "field_" + path] = "";
              } else {
                el.classList.remove("customjs-error");
                el.title = "";
                const strVal =
                  result.value === undefined || result.value === null
                    ? ""
                    : String(result.value);
                if (el.value !== strVal) el.value = strVal;
                data[field.name || "field_" + path] = result.value;
              }
            } else if (field.type === "autonumber") {
              if (!el.dataset.autoAssigned) {
                const seq = this.getNextAutoNumberSeq(field, formDef.id);
                el.value = this.formatAutoNumber(field, seq);
                el.dataset.autoAssigned = "1";
              }
              data[field.name || "field_" + path] = el.value;
            }
          }
          if (field.children && field.children.length && !field.repeatable) {
            walk(field.children, path);
          }
        });
      };
      (formDef.sections || []).forEach((section, sIdx) => {
        walk(section.fields || [], `${sIdx}`);
      });
    }

    // Menyatukan pembaruan visibilitas kondisional + kolom terhitung
    // menjadi satu titik panggilan tunggal.
    refreshFormState(container, formDef) {
      this.recalculateComputedFields(container, formDef);
      this.updateConditionalVisibility(container, formDef);
    }

    // Mengumpulkan nilai submission secara rekursif mengikuti struktur form
    // (hanya field yang sedang terlihat yang divalidasi & disertakan).
    // `targetData` adalah objek tujuan tempat pasangan key/value dituliskan
    // -- untuk field biasa ini adalah `data` di level teratas, tapi untuk
    // setiap instance/baris di dalam grup berulang ini adalah objek baru
    // yang terisolasi per baris, supaya hasilnya berupa array of object
    // (satu object per baris) pada key milik field panel berulang tersebut.
    collectSubmissionData(container, formDef) {
      const data = {};
      // errors: daftar terstruktur { path, field, message } dipakai untuk
      // menandai field yang salah langsung di form (border merah + pesan
      // inline), bukan cuma alert ringkasan di akhir.
      const errors = [];
      const missingLabels = [];

      const walk = (fields, pathPrefix, parentField, parentValue, targetData) => {
        (fields || []).forEach((field, idx) => {
          const path = `${pathPrefix}-${idx}`;

          if (field.type === "panel" && field.repeatable) {
            // Grup Field Dinamis / Repeater: kumpulkan satu object per
            // baris/instance yang sedang ada di DOM, lalu simpan sebagai
            // array pada key field ini (field.name).
            const instancesEl = container.querySelector(`[data-repeater-instances="${path}"]`);
            const instanceEls = instancesEl
              ? Array.from(instancesEl.querySelectorAll(".repeater-instance"))
              : [];
            const instancesData = instanceEls.map((instanceEl) => {
              const instanceIndex = instanceEl.dataset.instanceIndex;
              const instanceData = {};
              walk(field.children || [], `${path}.${instanceIndex}`, null, null, instanceData);
              return instanceData;
            });

            const min = Number.isFinite(field.repeatMin) ? Math.max(0, field.repeatMin) : 1;
            if (instancesData.length < min) {
              const itemLabel = field.repeatItemLabel || "item";
              missingLabels.push(
                (field.label || field.name || "Grup Berulang") + ` (minimal ${min} ${itemLabel})`,
              );
              errors.push({
                path,
                field,
                message: `Minimal ${min} ${itemLabel} harus diisi.`,
              });
            }

            targetData[field.name || "field_" + path] = instancesData;
            return;
          }

          if (field.type === "html" || field.type === "panel") {
            if (field.children && field.children.length) {
              walk(field.children, path, field, parentValue, targetData);
            }
            return;
          }

          let visible = true;
          if (parentField && isChoiceType(parentField.type) && field.visibleIfValue) {
            visible = this.fieldMatchesVisibleIf(field, parentValue);
          }

          if (!visible) {
            if (field.children && field.children.length) {
              walk(field.children, path, field, null, targetData);
            }
            return;
          }

          const value = this.getFieldDomValue(container, field, path);
          const key = field.name || "field_" + path;
          targetData[key] = value;

          if (field.required && this.isFieldValueEmpty(field, value)) {
            missingLabels.push(field.label || key);
            errors.push({ path, field, message: "Wajib diisi." });
          } else {
            const formatError = this.validateFieldFormat(field, value);
            if (formatError) {
              errors.push({ path, field, message: formatError });
            }
          }

          if (field.children && field.children.length) {
            walk(field.children, path, field, value, targetData);
          }
        });
      };

      (formDef.sections || []).forEach((section, sIdx) => {
        walk(section.fields || [], `${sIdx}`, null, null, data);
      });

      return { data, missingLabels, errors };
    }

    // Menghapus seluruh penanda error (border merah + pesan) di form saat
    // ini, dipanggil setiap kali submit dicoba ulang agar tidak menumpuk.
    clearFormErrors(container) {
      container.querySelectorAll(".field-preview.field-invalid").forEach((el) => {
        el.classList.remove("field-invalid");
      });
      container.querySelectorAll("[data-field-error]").forEach((el) => {
        el.textContent = "";
      });
    }

    // Menghapus penanda error untuk satu field saja (dipakai saat pengguna
    // mulai memperbaiki isian, supaya highlight merah langsung hilang).
    clearFieldError(container, wrapper) {
      if (!wrapper) return;
      wrapper.classList.remove("field-invalid");
      const path = wrapper.getAttribute("data-field-key");
      const errorEl = container.querySelector(`[data-field-error="${path}"]`);
      if (errorEl) errorEl.textContent = "";
    }

    // Menandai setiap field yang gagal validasi dengan border merah + pesan
    // error dalam Bahasa Indonesia tepat di bawah kontrolnya, lalu fokus &
    // scroll ke field pertama yang bermasalah.
    showFormErrors(container, errors) {
      let firstInvalidEl = null;
      errors.forEach(({ path, message }) => {
        const wrapper = container.querySelector(`.field-preview[data-field-key="${path}"]`);
        const errorEl = container.querySelector(`[data-field-error="${path}"]`);
        if (wrapper) {
          wrapper.classList.add("field-invalid");
          if (!firstInvalidEl) firstInvalidEl = wrapper;
        }
        if (errorEl) {
          errorEl.innerHTML = `<i class="bi bi-exclamation-circle"></i> ${this.escapeHtml(message)}`;
        }
      });
      if (firstInvalidEl) {
        firstInvalidEl.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusable = firstInvalidEl.querySelector("input, select, textarea");
        if (focusable) focusable.focus();
      }
    }

    submitRenderedForm(formId) {
      const formDef = this.getFormDefinition(formId);
      if (!formDef) return;
      const formContainer = document.getElementById("formgear-container");
      if (!formContainer) return;

      this.clearFormErrors(formContainer);

      const { data, errors } = this.collectSubmissionData(formContainer, formDef);

      if (errors.length) {
        this.showFormErrors(formContainer, errors);
        showAlert(
          "Terdapat " +
            errors.length +
            " isian yang belum valid. Periksa kolom yang ditandai merah pada form.",
        );
        return;
      }

      const savedForms = JSON.parse(
        localStorage.getItem(STORAGE_SUBMISSIONS) || "[]",
      );
      savedForms.push({
        formId,
        data,
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
      return data;
    }

    saveBuilderDefinition() {
      if (!this.currentForm) return;
      this.currentForm.id = this.currentForm.id || "form-" + Date.now();
      this.currentForm.createdAt = this.currentForm.createdAt || Date.now();
      // schemaVersion mengikuti versi bentuk-data engine saat ini (naik
      // hanya lewat migrateFormDefinition di masa depan, bukan di sini).
      this.currentForm.schemaVersion =
        this.currentForm.schemaVersion || FORMGEAR_SCHEMA_VERSION;
      const existingIndex = this.localDefinitions.findIndex(
        (def) => def.id === this.currentForm.id,
      );
      if (existingIndex >= 0) {
        // Form ini sudah pernah disimpan sebelumnya -> ini adalah revisi.
        // templateVersion (semver milik form/template ini sendiri, TERPISAH
        // dari FORMGEAR_ENGINE_VERSION dan APP_VERSION Saka Tracker) naik
        // PATCH otomatis setiap kali disimpan ulang.
        const previousVersion =
          this.localDefinitions[existingIndex].templateVersion || "1.0.0";
        this.currentForm.templateVersion = bumpPatchVersion(previousVersion);
        this.currentForm.updatedAt = Date.now();
        this.localDefinitions[existingIndex] = JSON.parse(
          JSON.stringify(this.currentForm),
        );
      } else {
        this.currentForm.templateVersion =
          this.currentForm.templateVersion || "1.0.0";
        this.currentForm.updatedAt = Date.now();
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
      if (typeof window.renderFormSelectorCards === "function") {
        window.renderFormSelectorCards();
      }
    }

    // ------------------------------------------------------------------
    // AI: generate kode Custom JS Column
    // ------------------------------------------------------------------
    setAiInstruction(aiKey, value) {
      this.aiCodeState[aiKey] = Object.assign({}, this.aiCodeState[aiKey], {
        instruction: value,
      });
    }

    buildFormFieldContext() {
      const fields = [];
      const walk = (arr) =>
        (arr || []).forEach((f) => {
          if (f.name && f.type !== "html" && f.type !== "panel") {
            fields.push({ name: f.name, label: f.label, type: f.type });
          }
          if (f.children) walk(f.children);
        });
      ((this.currentForm && this.currentForm.sections) || []).forEach((s) => walk(s.fields));
      return fields;
    }

    async generateCustomJsCode(sectionIndex, path, depth) {
      const field = this.getFieldByPath(sectionIndex, path, depth);
      if (!field) return;
      const aiKey = sectionIndex + ":" + path;
      const instruction =
        (this.aiCodeState[aiKey] && this.aiCodeState[aiKey].instruction) || "";
      this.aiCodeState[aiKey] = { status: "loading", instruction };
      this.renderBuilderPage();
      try {
        const context = this.buildFormFieldContext().filter(
          (f) => f.name !== field.name,
        );
        const code = await FormGearAI.generateJsCode({
          label: field.label,
          name: field.name,
          instruction,
          context,
        });
        if (!code) throw new Error("AI tidak mengembalikan kode.");
        field.jsCode = code;
        this.aiCodeState[aiKey] = {
          status: "done",
          instruction,
          message: "Kode berhasil dibuat oleh " + (FormGearAI.lastProvider || "AI") + ". Silakan tinjau sebelum dipakai.",
        };
      } catch (error) {
        this.aiCodeState[aiKey] = {
          status: "error",
          instruction,
          message:
            error && error.code === "NO_PROVIDER"
              ? "Belum ada API key AI dikonfigurasi di menu Pengaturan (OpenAI/Gemini/Mistral)."
              : (error && error.message) || "Gagal menghasilkan kode.",
        };
      }
      this.renderBuilderPage();
    }

    // ------------------------------------------------------------------
    // AI: saran template / struktur UI berdasarkan isi form
    // ------------------------------------------------------------------
    summarizeFormForAi(formDef) {
      const counts = {};
      let sectionCount = 0;
      const lines = [];
      (formDef.sections || []).forEach((section) => {
        sectionCount += 1;
        const fieldNames = (section.fields || [])
          .map((f) => {
            counts[f.type] = (counts[f.type] || 0) + 1;
            return `${f.label || f.name} [${FIELD_TYPE_LABELS[f.type] || f.type}]`;
          })
          .join(", ");
        lines.push(`Section "${section.title || "Tanpa judul"}": ${fieldNames || "(kosong)"}`);
      });
      return { text: lines.join("\n"), counts, sectionCount };
    }

    async requestAiTemplateSuggestion() {
      if (!this.currentForm) return;
      this.aiTemplateState = { status: "loading", message: "" };
      this.renderBuilderPage();
      const summary = this.summarizeFormForAi(this.currentForm);
      const templates = Array.isArray(window.FormGearTemplateCatalog)
        ? window.FormGearTemplateCatalog.map((t) => t.name)
        : [];
      try {
        const suggestion = await FormGearAI.suggestTemplate({
          formName: this.currentForm.name,
          formDescription: this.currentForm.description,
          fieldsSummary: summary.text,
          availableTemplates: templates,
        });
        this.aiTemplateState = {
          status: "done",
          message: suggestion,
          provider: FormGearAI.lastProvider,
        };
      } catch (error) {
        if (error && error.code === "NO_PROVIDER") {
          this.aiTemplateState = {
            status: "done",
            message: FormGearAI.deterministicTemplateSuggestion({
              fieldTypeCounts: summary.counts,
              sectionCount: summary.sectionCount,
            }),
            provider: "Fallback (non-AI)",
          };
        } else {
          this.aiTemplateState = {
            status: "error",
            message: (error && error.message) || "Gagal mengambil saran AI.",
          };
        }
      }
      this.renderBuilderPage();
    }

    renderAiTemplatePanel() {
      const state = this.aiTemplateState || {};
      if (state.status === "idle" || !state.status) return "";
      if (state.status === "loading") {
        return `
                    <div class="ai-template-panel ai-template-loading">
                        <i class="bi bi-arrow-repeat ai-spin"></i> Menganalisis isi form dan mencari saran template/UI...
                    </div>
                `;
      }
      if (state.status === "error") {
        return `
                    <div class="ai-template-panel ai-status-error">
                        <i class="bi bi-exclamation-triangle-fill"></i> ${this.escapeHtml(state.message || "Gagal mengambil saran AI.")}
                    </div>
                `;
      }
      const providerLabel = state.provider ? this.escapeHtml(state.provider) : "AI";
      const bodyHtml = this.escapeHtml(state.message || "")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => `<p>${line}</p>`)
        .join("");
      return `
                <div class="ai-template-panel ai-status-ok">
                    <div class="ai-template-panel-header"><i class="bi bi-stars"></i> Saran Template &amp; UI (${providerLabel})</div>
                    <div class="ai-template-panel-body">${bodyHtml || "<p>(tidak ada saran)</p>"}</div>
                </div>
            `;
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
      // Versi awal template ini sendiri (naik PATCH otomatis setiap kali
      // disimpan ulang lewat saveBuilderDefinition) - independen dari
      // FORMGEAR_ENGINE_VERSION (versi engine) dan APP_VERSION (Saka Tracker).
      templateVersion: '1.0.0',
      schemaVersion: FORMGEAR_SCHEMA_VERSION,
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
    window.copyBuilderJson();
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
    if (typeof showProcessing === 'function') showProcessing('Mengunggah Definisi Form...', 'Menyimpan struktur form ke Firebase, mohon tunggu.');
    try {
      await window.formGearFirebaseManager.saveFormDefinition(instance.currentForm);
      if (typeof closeProcessing === 'function') closeProcessing();
      showAlert('Definisi form berhasil diunggah ke Firebase.');
    } catch (error) {
      console.error(error);
      if (typeof closeProcessing === 'function') closeProcessing();
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

    if (typeof showProcessing === 'function') showProcessing('Mengunggah Data Preview...', 'Mengirim data ke Firebase, mohon tunggu.');
    try {
      await window.formGearFirebaseManager.uploadFormData(instance.currentForm.id, submission);
      if (typeof closeProcessing === 'function') closeProcessing();
      showAlert('Data preview berhasil diunggah ke Firebase.');
    } catch (error) {
      console.error(error);
      if (typeof closeProcessing === 'function') closeProcessing();
      showAlert('Gagal mengunggah preview: ' + error.message);
    }
  };
  window.copyBuilderJson = function () {
    const output = document.getElementById('builder-json-output');
    if (!output) return;
    const text = output.textContent || '';
    if (!text.trim()) {
      showAlert('Belum ada JSON untuk disalin.');
      return;
    }

    const fallbackCopy = () => {
      try {
        const range = document.createRange();
        range.selectNodeContents(output);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const ok = document.execCommand('copy');
        selection.removeAllRanges();
        if (ok) {
          showAlert('JSON berhasil disalin.');
        } else {
          showAlert('Gagal menyalin JSON.');
        }
      } catch (error) {
        console.error(error);
        showAlert('Gagal menyalin JSON.');
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showAlert('JSON berhasil disalin.'),
        () => fallbackCopy(),
      );
    } else {
      fallbackCopy();
    }
  };
  window.selectBuilderTemplate = function (formId) {
    window.FormGearBuilderInstance.selectForm(formId);
  };
})();
