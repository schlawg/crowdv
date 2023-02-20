import { KaldiRecognizer, createModel, Model } from "vosk-browser";
import { KaldiOpts, WordResult } from "./interfaces";

let kaldi: KaldiRecognizer;
let voiceModel: Model;

export default (window as any).Vosk = {
  initModel: async function (url: string): Promise<void> {
    voiceModel = await createModel(url);
  },

  initKaldi: async function (opts: KaldiOpts): Promise<AudioNode> {
    if (kaldi) {
      kaldi.remove();
    }
    kaldi = new voiceModel.KaldiRecognizer(
      opts.audioCtx.sampleRate,
      JSON.stringify(opts.keys)
    );
    kaldi.setWords(true);
    kaldi.on("result", (message: any) => {
      if (
        !("result" in message && "text" in message.result) ||
        message.result.text.length < 2
      )
        return;

      opts.broadcast(
        message.result.text as string,
        "command",
        message.result.result as WordResult,
        3000
      );
    });

    return vanillaProcessor(opts.audioCtx);
  },
};

//========================== works ok on all but deprecated ==============================

function vanillaProcessor(audioCtx: AudioContext): AudioNode {
  // createScriptProcessor was deprecated in 2014
  const voskNode = audioCtx.createScriptProcessor(4096, 1, 1);

  voskNode.onaudioprocess = (e: any) => kaldi.acceptWaveform(e.inputBuffer);
  return voskNode;
}
