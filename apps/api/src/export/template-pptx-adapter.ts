import Automizer, { NullLogger } from "pptx-automizer";

/** Isolated adapter for preserving professional masters/layouts while composing selected native slides. */
export class TemplatePptxAdapter {
  async copySlides(template: Uint8Array, slideNumbers: number[]): Promise<Uint8Array> {
    if (!slideNumbers.length) throw new Error("At least one source slide is required");
    const source = Buffer.from(template);
    const automizer = new Automizer({ rootTemplate: source, removeExistingSlides: true, autoImportSlideMasters: true, assertRelatedContents: true, cleanup: true, continueOnError: false, logger: new NullLogger() });
    automizer.load(source, "source");
    slideNumbers.forEach((slideNumber) => automizer.addSlide("source", slideNumber));
    await automizer.presentation();
    const archive = await automizer.getJSZip();
    return new Uint8Array(await archive.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } }));
  }
}
