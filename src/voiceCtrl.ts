import { VoiceCtrl, VoiceListener, MsgType, WordResult } from './interfaces';
import { objectStorage } from './objectStorage';

export const modelSource = 'model-en-us-0.15.tar.gz';
export const assetPrefix = ''; //'crowdv/';
export const makeVoiceCtrl = () =>
  new (class implements VoiceCtrl {
    audioCtx: AudioContext | undefined;
    mediaStream: MediaStream | undefined;
    download: XMLHttpRequest | undefined;
    voskStatus = '';
    busy = false;
    broadcastTimeout: number | undefined;
    listeners = new Map<string, VoiceListener>();

    addListener = (name: string, listener: VoiceListener) => this.listeners.set(name, listener);

    get isBusy(): boolean {
      return this.busy;
    }
    get status(): string {
      return this.voskStatus;
    }
    set status(status: string) {
      this.voskStatus = status;
    }
    get isRecording(): boolean {
      return this.mediaStream !== undefined && !this.busy;
    }
    stop() {
      this.audioCtx?.close();
      this.download?.abort();
      this.mediaStream?.getAudioTracks().forEach(track => track.stop());
      this.mediaStream = undefined;
      this.audioCtx = undefined;
      if (!this.download) this.broadcast('');
      this.download = undefined;
    }
    async start(): Promise<void> {
      if (this.isRecording) return;
      let [msgText, msgType] = ['Unknown', 'error' as MsgType];
      try {
        this.busy = true;
        this.broadcast('Loading...');
        const modelUrl = 'https://lichess1.org/assets/_b6939d/vendor/vosk/model-en-us-0.15.tar.gz';
        const downloadAsync = this.downloadModel(`/vosk/${modelUrl.replace(/[\W]/g, '_')}`);
        if (!(window as any).Vosk) await loadModule(`${assetPrefix}vosk.js`);

        const rsp = await fetch(`${assetPrefix}vocabulary.json`);
        const vocab = await rsp.json();
        console.log(vocab);

        this.audioCtx = new AudioContext();
        const sampleRate = this.audioCtx.sampleRate;
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            sampleRate: sampleRate,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        this.audioCtx = new AudioContext({ sampleRate });
        const micSource = this.audioCtx.createMediaStreamSource(this.mediaStream);

        await downloadAsync;
        await (window as any).Vosk.initModel(modelUrl);

        if (!this.audioCtx) throw 'Aborted';
        const voskNode = await (window as any).Vosk.initKaldi({
          audioCtx: this.audioCtx,
          keys: vocab,
          broadcast: this.broadcast.bind(this),
        });
        micSource.connect(voskNode!);
        voskNode.connect(this.audioCtx.destination);
        [msgText, msgType] = ['Listening...', 'status'];
      } catch (e: any) {
        this.stop();
        console.log(e);
        [msgText, msgType] = [e.toString(), 'error'];
        throw e;
      } finally {
        this.busy = false;
        this.broadcast(msgText, msgType);
      }
    }
    broadcast(text: string, _: MsgType = 'status', full: WordResult | undefined = undefined, __: any = 0) {
      this.voskStatus = text;
      for (const li of this.listeners.values()) li(text, full);
    }

    async downloadModel(emscriptenPath: string): Promise<void> {
      // don't look at this, it's gross.  but we need cancel & progress.
      // trick vosk-browser into using our model by sneaking it into the emscripten IDBFS
      const voskStore = await objectStorage<any>({
        db: '/vosk',
        store: 'FILE_DATA',
        version: 21,
        upgrade: (_, idbStore?: IDBObjectStore) => {
          // make emscripten fs happy
          idbStore?.createIndex('timestamp', 'timestamp', { unique: false });
        },
      });
      if ((await voskStore.count(`${emscriptenPath}/extracted.ok`)) > 0) return;

      const modelBlob: ArrayBuffer | undefined = await new Promise((resolve, reject) => {
        this.download = new XMLHttpRequest();
        this.download.open('GET', modelSource, true);
        this.download.responseType = 'arraybuffer';
        this.download.onerror = _ => reject('Failed. See console');
        this.download.onabort = _ => reject('Aborted');
        this.download.onprogress = (e: ProgressEvent) =>
          this.broadcast(`Downloaded ${Math.round((100 * e.loaded) / e.total)}% of ${Math.round(e.total / 1000000)}MB`);
        this.download.onload = _ => {
          this.broadcast('Extracting...');
          resolve(this.download?.response);
        };
        this.download.send();
      });
      const now = new Date();
      await voskStore.put(emscriptenPath, { timestamp: now, mode: 16877 });
      await voskStore.put(`${emscriptenPath}/downloaded.ok`, {
        contents: new Uint8Array([]),
        timestamp: now,
        mode: 33206,
      });
      await voskStore.remove(`${emscriptenPath}/downloaded.tar.gz`);
      await voskStore.put(`${emscriptenPath}/downloaded.tar.gz`, {
        contents: new Uint8Array(modelBlob!),
        timestamp: now,
        mode: 33188,
      });
      voskStore.txn('readwrite').objectStore('FILE_DATA').index('timestamp');
    }
  })();

export const jsonHeader = {
  Accept: 'application/json',
};

export const defaultInit: RequestInit = {
  cache: 'no-cache',
  credentials: 'same-origin',
};

export const ensureOk = (res: Response): Response => {
  if (res.ok) return res;
  if (res.status == 429) throw new Error('Too many requests');
  if (res.status == 413) throw new Error('The uploaded file is too large');
  throw new Error(`Error ${res.status}`);
};

export const json = (url: string, init: RequestInit = {}): Promise<any> =>
  jsonAnyResponse(url, init).then(res => ensureOk(res).json());

export const jsonAnyResponse = (url: string, init: RequestInit = {}): Promise<any> =>
  fetch(url, {
    ...defaultInit,
    headers: {
      ...jsonHeader,
    },
    ...init,
  });

export const text = (url: string, init: RequestInit = {}): Promise<string> =>
  textRaw(url, init).then(res => ensureOk(res).text());

export const textRaw = (url: string, init: RequestInit = {}): Promise<Response> =>
  fetch(url, {
    ...defaultInit,
    ...init,
  });

export const script = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const nonce = document.body.getAttribute('data-nonce'),
      el = document.createElement('script');
    if (nonce) el.setAttribute('nonce', nonce);
    el.onload = resolve as () => void;
    el.onerror = reject;
    el.src = src;
    document.head.append(el);
  });

const loadedScript = new Map<string, Promise<void>>();
export const loadScript = (url: string): Promise<void> => {
  if (!loadedScript.has(url)) loadedScript.set(url, script(url));
  return loadedScript.get(url)!;
};

export const loadModule = (name: string): Promise<void> => loadScript(name);
export const loadIife = async (name: string, iife: keyof Window) => {
  await loadModule(name);
  return window[iife];
};
