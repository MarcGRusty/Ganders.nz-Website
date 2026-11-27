-- Montserrat becomes the default font. Move a saved Harbour theme still on the old fonts across.
UPDATE settings SET
  value = json_set(value, '$.theme.displayFont', 'Montserrat', '$.theme.bodyFont', 'Montserrat', '$.theme.displayWidth', 100, '$.theme.displayWeight', 700),
  updated_at = datetime('now')
WHERE key = 'site'
  AND json_extract(value, '$.theme.preset') = 'harbour'
  AND json_extract(value, '$.theme.displayFont') = 'Archivo';
