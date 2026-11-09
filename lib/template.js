// A ready-to-fill Excel template, written as plain .xlsx parts (zip them with makeZip).
// It round-trips through readXlsx() + buildSchedule(), so whatever the user types here imports cleanly.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const col = (i) => {
  let s = "";
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

function sheetXml(rows, widths = [], headerRow = -1) {
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const body = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          if (v === "" || v == null) return "";
          const ref = `${col(ci)}${ri + 1}`;
          const style = ri === headerRow ? ' s="1"' : ri === 0 ? ' s="2"' : ' s="3"';
          if (typeof v === "number") return `<c r="${ref}"${style}><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const freeze = headerRow >= 0 ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow + 1}" topLeftCell="A${headerRow + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${body}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font><font><b/><sz val="14"/><color rgb="FFDC3A63"/><name val="Tahoma"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1557A"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
</styleSheet>`;

/** sheets: [{ name, rows, widths?, headerRow? }] → [{ name, data }] parts of an .xlsx */
export function xlsxParts(sheets) {
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("")}</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return [
    { name: "[Content_Types].xml", data: ct },
    { name: "_rels/.rels", data: rels },
    { name: "xl/workbook.xml", data: wb },
    { name: "xl/_rels/workbook.xml.rels", data: wbRels },
    { name: "xl/styles.xml", data: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows, s.widths, s.headerRow ?? -1) })),
  ];
}

const AM = "คลีนเซอร์ -> เซรั่ม -> มอยส์เจอร์ไรเซอร์ -> กันแดด";
const PM = {
  A: "คลีนเซอร์ -> โทนเนอร์ BHA -> มอยส์เจอร์ไรเซอร์",
  B: "คลีนเซอร์ -> เซรั่ม Retinol -> มอยส์เจอร์ไรเซอร์",
  C: "คลีนเซอร์ -> เซรั่ม -> มอยส์เจอร์ไรเซอร์",
};
const LABEL = { A: "ผลัดเซลล์", B: "เรตินอยด์", C: "พักผิว" };
const PATTERN = ["A", "C", "B", "C", "C"];

/** The template workbook: a 30-day table, a product list and a short how-to. */
export function templateSheets() {
  const days = Array.from({ length: 30 }, (_, i) => {
    const t = PATTERN[i % PATTERN.length];
    return [`วัน ${i + 1}`, "", `[${t}] ${LABEL[t]}`, AM, PM[t], ""];
  });
  return [
    {
      name: "ตาราง 30 วัน",
      headerRow: 2,
      widths: [9, 12, 16, 46, 46, 24],
      rows: [
        ["ตารางสกินแคร์ของฉัน"],
        ["แก้ชื่อสินค้าในตารางด้านล่างได้เลย คั่นแต่ละขั้นด้วย ->"],
        ["วัน", "วันที่", "รูปแบบคืน", "เช้า", "เย็น", "หมายเหตุ"],
        ...days,
      ],
    },
    {
      name: "สินค้า",
      headerRow: 0,
      widths: [7, 34, 18, 46],
      rows: [
        ["ลำดับ", "ชื่อสินค้า", "ประเภท", "วิธีใช้"],
        [1, "คลีนเซอร์", "ล้างหน้า", "ลูบเบา ๆ 30 วินาที แล้วล้างออก"],
        [2, "โทนเนอร์ BHA", "ผลัดเซลล์", "ทาบาง ๆ เฉพาะคืนผลัดเซลล์"],
        [3, "เซรั่ม Retinol", "เรตินอยด์", "ปริมาณเท่าเม็ดถั่ว เลี่ยงรอบตา"],
        [4, "เซรั่ม", "เซรั่ม", ""],
        [5, "มอยส์เจอร์ไรเซอร์", "ครีม", ""],
        [6, "กันแดด", "กันแดด", "ทา 2 ข้อนิ้ว ก่อนออกแดด 15 นาที"],
      ],
    },
    {
      name: "วิธีกรอก",
      widths: [100],
      rows: [
        ["วิธีกรอกตาราง"],
        ["1) ชีต “ตาราง 30 วัน” ต้องมีแถวหัวตารางที่มีคอลัมน์ “เช้า” และ “เย็น” (คอลัมน์อื่นไม่บังคับ)"],
        ["2) ใส่ขั้นตอนเรียงตามลำดับที่ทา คั่นด้วย -> เช่น คลีนเซอร์ -> เซรั่ม -> กันแดด"],
        ["3) คอลัมน์ “รูปแบบคืน” เขียนแบบ [A] ชื่อ เพื่อให้แอพแยกสีแต่ละคืน (ไม่ใส่ก็ได้)"],
        ["4) จะมีกี่วันก็ได้ แอพจะวนรอบให้เอง — ถ้าใส่เวลาเช่น “10-15 นาที” ในวิธีใช้ แอพจะจับเวลาให้"],
        ["5) ชีต “สินค้า” ไม่บังคับ — ใส่วิธีใช้ไว้ แอพจะแสดงตอนทาแต่ละขั้น"],
      ],
    },
  ];
}
