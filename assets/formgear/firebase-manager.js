class FormGearFirebaseManager {
  constructor() {
    this.initialized = false;
    this.app = null;
    this.db = null;
    this.firebaseConfig = {
      apiKey: "AIzaSyCjyYMXZFhEZXn4JwL67LOxc6nZqszgyQQ",
      authDomain: "formgear.firebaseapp.com",
      databaseURL:
        "https://formgear-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId: "formgear",
      storageBucket: "formgear.firebasestorage.app",
      messagingSenderId: "980081925784",
      appId: "1:980081925784:web:3315deaeb620fc5fb77aed",
      measurementId: "G-QVBSCKQTCN",
    };
    this.init();
  }

  init() {
    if (!window.firebase || !firebase.initializeApp || !firebase.database) {
      console.warn("[FormGear] Firebase SDK belum tersedia.");
      return;
    }

    try {
      if (!firebase.apps.length) {
        this.app = firebase.initializeApp(this.firebaseConfig);
      } else {
        this.app = firebase.app();
      }
      this.db = firebase.database();
      this.initialized = true;
    } catch (error) {
      console.error("[FormGear] Gagal inisialisasi Firebase:", error);
    }
  }

  async uploadFormData(formId, data) {
    if (!this.initialized) {
      throw new Error("Firebase belum siap.");
    }

    const ref = this.db.ref(`submissions/${formId}`);
    const newRef = ref.push();
    await newRef.set({
      formId,
      data,
      timestamp: Date.now(),
    });
    return newRef.key;
  }

  async getFormSubmissions(formId) {
    if (!this.initialized) {
      return [];
    }

    const snapshot = await this.db.ref(`submissions/${formId}`).once("value");
    const submissions = [];

    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.keys(data).forEach((key) => {
        submissions.push({ id: key, ...data[key] });
      });
    }

    return submissions;
  }

  async saveFormDefinition(formDef) {
    if (!this.initialized) {
      throw new Error("Firebase belum siap.");
    }

    await this.db.ref(`forms/${formDef.id}`).set(formDef);
    return formDef.id;
  }

  async fetchFormDefinitions() {
    if (!this.initialized) {
      return [];
    }

    const snapshot = await this.db.ref("forms").once("value");
    const forms = [];

    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.keys(data).forEach((key) => {
        forms.push({ id: key, ...data[key] });
      });
    }

    return forms;
  }
}
