export type MsgType = 'command' | 'status' | 'error';

export type VoiceListener = (msgText: string, full: any) => void;

export interface VoiceCtrl {
  start: () => Promise<void>; // initialize and begin recording
  stop: () => void; // stop recording/downloading/whatever
  readonly isBusy: boolean; // are we downloading, extracting, or loading?
  readonly isRecording: boolean; // are we recording?
  readonly status: string; // errors, progress, or the most recent voice command
  addListener: (name: string, listener: VoiceListener) => void;
}

export interface KaldiOpts {
  keys: string[];
  audioCtx: AudioContext;
  broadcast: (msgText: string, msgType: MsgType, words: WordResult | undefined, forMs: number) => void;
}

export type WordResult = Array<{
  conf: number;
  start: number;
  end: number;
  word: string;
}>;

export type PhraseResult = { result: WordResult; text: string };
