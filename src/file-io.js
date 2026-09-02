/* ================= Browser file load / save ================= */
async function loadTemplateAsBase() {
  const bin = atob(TEMPLATE_BASE64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  BASE_WORKBOOK_BYTES = bytes.buffer;
}

/* Loading and saving now live in "The MIS folder" section above: addFiles() brings a
   whole folder in, doSave() writes back every workbook that changed. */
