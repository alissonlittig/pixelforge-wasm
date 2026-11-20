//! PixelForge core: decode, resize, re-encode and zip images. No I/O, no network.
use image::{codecs::jpeg::JpegEncoder, codecs::png::{CompressionType, FilterType, PngEncoder}, codecs::webp::WebPEncoder,
    imageops::FilterType as Resize, DynamicImage, ExtendedColorType, ImageEncoder, Rgba, RgbaImage};
use std::io::{Cursor, Write};
use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Fmt { Jpeg, Png, Webp }

impl Fmt {
    pub fn parse(s: &str) -> Option<Fmt> {
        match s { "jpeg" | "jpg" => Some(Fmt::Jpeg), "png" => Some(Fmt::Png), "webp" => Some(Fmt::Webp), _ => None }
    }
}

pub struct Out { pub bytes: Vec<u8>, pub w: u32, pub h: u32, pub src_w: u32, pub src_h: u32 }

/// Decode `data`, shrink so the longest side is <= `max_side` (0 = keep), encode as `fmt`.
/// `quality` (1-100) only affects JPEG; PNG and WebP are lossless.
pub fn convert(data: &[u8], fmt: Fmt, quality: u8, max_side: u32) -> Result<Out, String> {
    let img = image::load_from_memory(data).map_err(|e| format!("cannot decode: {e}"))?;
    let (src_w, src_h) = (img.width(), img.height());
    let img = if max_side > 0 && src_w.max(src_h) > max_side {
        img.resize(max_side, max_side, Resize::Lanczos3)
    } else { img };
    let (w, h) = (img.width(), img.height());
    let mut bytes = Vec::new();
    match fmt {
        Fmt::Jpeg => {
            let rgb = flatten(&img);
            JpegEncoder::new_with_quality(&mut bytes, quality.clamp(1, 100))
                .write_image(rgb.as_raw(), w, h, ExtendedColorType::Rgb8).map_err(|e| e.to_string())?;
        }
        Fmt::Png => {
            let rgba = img.to_rgba8();
            PngEncoder::new_with_quality(&mut bytes, CompressionType::Best, FilterType::Adaptive)
                .write_image(rgba.as_raw(), w, h, ExtendedColorType::Rgba8).map_err(|e| e.to_string())?;
        }
        Fmt::Webp => {
            let rgba = img.to_rgba8();
            WebPEncoder::new_lossless(&mut bytes)
                .write_image(rgba.as_raw(), w, h, ExtendedColorType::Rgba8).map_err(|e| e.to_string())?;
        }
    }
    Ok(Out { bytes, w, h, src_w, src_h })
}

/// JPEG has no alpha: composite over white.
fn flatten(img: &DynamicImage) -> image::RgbImage {
    let rgba: RgbaImage = img.to_rgba8();
    let mut out = image::RgbImage::new(rgba.width(), rgba.height());
    for (x, y, Rgba([r, g, b, a])) in rgba.enumerate_pixels().map(|(x, y, p)| (x, y, *p)) {
        let a = a as u32;
        let m = |c: u8| ((c as u32 * a + 255 * (255 - a)) / 255) as u8;
        out.put_pixel(x, y, image::Rgb([m(r), m(g), m(b)]));
    }
    out
}

#[wasm_bindgen]
pub struct Processed { bytes: Vec<u8>, w: u32, h: u32, src_w: u32, src_h: u32 }

#[wasm_bindgen]
impl Processed {
    #[wasm_bindgen(getter)] pub fn bytes(&self) -> Vec<u8> { self.bytes.clone() }
    #[wasm_bindgen(getter)] pub fn width(&self) -> u32 { self.w }
    #[wasm_bindgen(getter)] pub fn height(&self) -> u32 { self.h }
    #[wasm_bindgen(getter)] pub fn src_width(&self) -> u32 { self.src_w }
    #[wasm_bindgen(getter)] pub fn src_height(&self) -> u32 { self.src_h }
}

/// `format`: "jpeg" | "png" | "webp".
#[wasm_bindgen]
pub fn process(data: &[u8], format: &str, quality: u8, max_side: u32) -> Result<Processed, JsError> {
    let fmt = Fmt::parse(format).ok_or_else(|| JsError::new("unknown format"))?;
    let o = convert(data, fmt, quality, max_side).map_err(|e| JsError::new(&e))?;
    Ok(Processed { bytes: o.bytes, w: o.w, h: o.h, src_w: o.src_w, src_h: o.src_h })
}

/// Builds a zip (stored, images are already compressed) in memory.
#[wasm_bindgen]
pub struct ZipBuilder { w: zip::ZipWriter<Cursor<Vec<u8>>> }

#[wasm_bindgen]
impl ZipBuilder {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ZipBuilder { ZipBuilder { w: zip::ZipWriter::new(Cursor::new(Vec::new())) } }
    pub fn add(&mut self, name: &str, data: &[u8]) -> Result<(), JsError> {
        let o = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        self.w.start_file(name, o).map_err(|e| JsError::new(&e.to_string()))?;
        self.w.write_all(data).map_err(|e| JsError::new(&e.to_string()))
    }
    pub fn finish(self) -> Result<Vec<u8>, JsError> {
        self.w.finish().map(|c| c.into_inner()).map_err(|e| JsError::new(&e.to_string()))
    }
}

impl Default for ZipBuilder { fn default() -> Self { Self::new() } }

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Vec<u8> {
        let img = RgbaImage::from_fn(200, 100, |x, y| Rgba([(x % 256) as u8, (y * 2) as u8, 128, 255]));
        let mut b = Vec::new();
        PngEncoder::new(&mut b).write_image(img.as_raw(), 200, 100, ExtendedColorType::Rgba8).unwrap();
        b
    }
    #[test]
    fn png_to_jpeg_resized_and_smaller() {
        let src = sample();
        let o = convert(&src, Fmt::Jpeg, 70, 100).unwrap();
        assert_eq!((o.w, o.h, o.src_w), (100, 50, 200));
        assert_eq!(&o.bytes[..2], &[0xFF, 0xD8]);
    }
    #[test]
    fn roundtrip_webp_png_and_zip() {
        let src = sample();
        let w = convert(&src, Fmt::Webp, 80, 0).unwrap();
        assert_eq!(&w.bytes[..4], b"RIFF");
        let p = convert(&w.bytes, Fmt::Png, 80, 0).unwrap();
        assert_eq!((p.w, p.h), (200, 100));
        let mut z = ZipBuilder::new();
        z.add("a.png", &p.bytes).unwrap();
        let out = z.finish().unwrap();
        assert_eq!(&out[..2], b"PK");
    }
    #[test]
    fn garbage_is_error() { assert!(convert(b"nope", Fmt::Png, 80, 0).is_err()); }
}
