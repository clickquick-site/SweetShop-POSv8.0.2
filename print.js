/**
 * print.js — وحدة الطباعة لتطبيق E-Commerce DZ
 * =====================================================
 * إصلاح شامل:
 *  1. الفاتورة: عرض صحيح 58mm/80mm بدون قطع
 *  2. الباركود: طباعة عمودية (Portrait) داخل الملصق
 * =====================================================
 */

(function (window) {
  'use strict';

  // ─── ثوابت ───────────────────────────────────────────────────────────────
  // DPI الطابعة الحرارية (203 نقطة/بوصة = 8 نقطة/مم)
  const PRINTER_DPI = 203;
  const PX_PER_MM   = PRINTER_DPI / 25.4;   // ≈ 8

  // أبعاد الملصقات بالمم (العرض × الارتفاع) — Portrait
  const LABEL_SIZES = {
    '30x20': { w: 30, h: 20 },
    '40x20': { w: 40, h: 20 },
    '38x25': { w: 38, h: 25 },
    '40x25': { w: 40, h: 25 },
    '40x30': { w: 40, h: 30 },
    '58x20': { w: 58, h: 20 },
    '58x30': { w: 58, h: 30 },
  };

  // ─── مساعد: قراءة إعداد ──────────────────────────────────────────────────
  async function cfg(key, def = '') {
    try { return (await window.getSetting(key)) || def; }
    catch { return def; }
  }

  // ─── مساعد: إنشاء نافذة طباعة معزولة ────────────────────────────────────
  function openPrintWindow(html, css, title) {
    const w = window.open('', '_blank',
      'width=600,height=800,menubar=no,toolbar=no,location=no,status=no');
    if (!w) { alert('فعّل النوافذ المنبثقة للطباعة'); return null; }
    w.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>${html}</body>
</html>`);
    w.document.close();
    return w;
  }

  // ─── مساعد: طباعة وإغلاق نافذة ──────────────────────────────────────────
  function triggerPrint(w) {
    if (!w) return;
    w.onload = () => {
      w.focus();
      w.print();
      setTimeout(() => { try { w.close(); } catch {} }, 500);
    };
    // إذا لم يطلق onload (النافذة محمّلة مسبقاً)
    setTimeout(() => {
      if (!w.closed) {
        w.focus();
        w.print();
        setTimeout(() => { try { w.close(); } catch {} }, 500);
      }
    }, 300);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  1. طباعة الفاتورة
  // ══════════════════════════════════════════════════════════════════════════
  async function printInvoice(sale, items) {
    if (!sale) return;

    // ── تحميل الإعدادات ──────────────────────────────────────────────────
    const paper      = await cfg('paperSize',     '80mm');
    const storeName  = await cfg('storeName',     '');
    const storePhone = await cfg('storePhone',    '');
    const storeAddr  = await cfg('storeAddress',  '');
    const welcome    = await cfg('storeWelcome',  'شكراً لزيارتكم');
    const currency   = await cfg('currency',      'DA');
    const showLogo   = (await cfg('printLogo',    '1')) === '1';
    const showName   = (await cfg('printName',    '1')) === '1';
    const showPhone  = (await cfg('printPhone',   '1')) === '1';
    const showAddr   = (await cfg('printAddress', '1')) === '1';
    const showWelc   = (await cfg('printWelcome', '1')) === '1';
    const showBC     = (await cfg('printBarcode', '1')) === '1';

    // ── عرض الورق بالمم ──────────────────────────────────────────────────
    const paperMm = paper === '58mm' ? 58 : 80;

    // ── تنسيق الأرقام ────────────────────────────────────────────────────
    const fmt = (n) => {
      const v = parseFloat(n) || 0;
      return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
    };

    // ── بناء HTML الفاتورة ────────────────────────────────────────────────
    const date = sale.date
      ? new Date(sale.date).toLocaleString('ar-DZ', {
          year:'numeric', month:'2-digit', day:'2-digit',
          hour:'2-digit', minute:'2-digit', hour12: false
        }).replace(',', '')
      : '';

    let rows = '';
    (items || []).forEach(it => {
      rows += `
        <tr>
          <td class="col-name">${escHtml(it.name || '')}</td>
          <td class="col-qty">${fmt(it.quantity)}</td>
          <td class="col-price">${fmt(it.unitPrice)}</td>
          <td class="col-total">${fmt(it.total)}</td>
        </tr>`;
    });

    // حساب الخصم والباقي
    const total    = parseFloat(sale.total)    || 0;
    const discount = parseFloat(sale.discount) || 0;
    const paid     = parseFloat(sale.paid)     || 0;
    const change   = parseFloat(sale.change)   || 0;
    const isDebt   = sale.isDebt || sale.invoiceKind === 'debt';

    let summaryRows = `
      <tr class="sum-row">
        <td colspan="3" class="sum-label">الإجمالي:</td>
        <td class="sum-value">${fmt(total)} ${currency}</td>
      </tr>`;
    if (discount > 0) {
      summaryRows += `
        <tr>
          <td colspan="3" class="sum-label">الخصم:</td>
          <td class="sum-value">- ${fmt(discount)} ${currency}</td>
        </tr>`;
    }
    summaryRows += `
      <tr>
        <td colspan="3" class="sum-label">المدفوع:</td>
        <td class="sum-value">${isDebt ? 'دَيْن' : fmt(paid) + ' ' + currency}</td>
      </tr>`;
    if (!isDebt && change > 0) {
      summaryRows += `
        <tr>
          <td colspan="3" class="sum-label">الباقي:</td>
          <td class="sum-value">${fmt(change)} ${currency}</td>
        </tr>`;
    }

    // باركود الفاتورة (SVG بسيط)
    const invNum = sale.invoiceNumber || '';
    const bcHtml = showBC ? `
      <div class="bc-zone">
        <div class="bc-bars">||||||||||||||||||||||||||||||||</div>
        <div class="bc-num">${escHtml(invNum)}</div>
      </div>` : '';

    const html = `
<div class="receipt">

  <!-- رأس الفاتورة -->
  <table class="head-table">
    <tr>
      <td class="head-r"><strong>فاتورة ${escHtml(invNum)}</strong></td>
      <td class="head-l">${escHtml(date)}</td>
    </tr>
    <tr>
      <td class="head-r">البائع:</td>
      <td class="head-l">${escHtml(sale.sellerName || 'ADMIN')}</td>
    </tr>
    ${(sale.customerName || sale.customerPhone) ? `
    <tr>
      <td class="head-r">الزبون:</td>
      <td class="head-l">${escHtml(sale.customerName || sale.customerPhone || '')}</td>
    </tr>` : ''}
  </table>

  <hr class="double"/>

  <!-- اسم المتجر -->
  ${showName && storeName ? `<div class="store-name">${escHtml(storeName)}</div>` : ''}
  ${showPhone && storePhone ? `<div class="store-info">${escHtml(storePhone)}</div>` : ''}
  ${showAddr  && storeAddr  ? `<div class="store-info small">${escHtml(storeAddr)}</div>` : ''}
  ${(showName && storeName) || (showPhone && storePhone) || (showAddr && storeAddr)
      ? '<hr class="double"/>' : ''}

  <!-- جدول المنتجات -->
  <table class="items-table">
    <thead>
      <tr>
        <th class="col-name">المنتج</th>
        <th class="col-qty">ك</th>
        <th class="col-price">السعر</th>
        <th class="col-total">المجموع</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <hr class="single"/>

  <!-- المجاميع -->
  <table class="sum-table">
    ${summaryRows}
  </table>

  <hr class="double"/>

  <!-- رسالة الشكر -->
  ${showWelc && welcome ? `<div class="welcome">${escHtml(welcome)}</div>` : ''}

  <!-- باركود -->
  ${bcHtml}

  <hr class="dashed"/>
  <div style="margin-bottom:8mm;"></div>

</div>`;

    // ── CSS الطباعة ───────────────────────────────────────────────────────
    const css = `
/* ── إعادة تعيين كاملة ── */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* ── @page: تحديد عرض الورق الدقيق ── */
@page {
  size: ${paperMm}mm auto;
  margin: 2mm 1.5mm;
}

html, body {
  width: ${paperMm}mm;
  margin: 0;
  padding: 0;
  background: #fff;
  color: #000;
  font-family: "Tahoma", "Arial", sans-serif;
  font-size: ${paper === '58mm' ? '7.5pt' : '8.5pt'};
  direction: rtl;
}

.receipt {
  width: 100%;
  overflow: hidden;
}

/* ── رأس الفاتورة ── */
.head-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.head-r {
  text-align: right;
  vertical-align: top;
  width: 55%;
  padding: 0 0 1mm 0;
}
.head-l {
  text-align: left;
  vertical-align: top;
  width: 45%;
  padding: 0 0 1mm 0;
  font-size: 0.85em;
  direction: ltr;
}

/* ── فواصل ── */
hr { border: none; margin: 1.5mm 0; }
hr.single { border-top: 0.3mm solid #000; }
hr.double { border-top: 0.6mm solid #000; }
hr.dashed  { border-top: 0.3mm dashed #888; }

/* ── اسم المتجر ── */
.store-name {
  text-align: center;
  font-weight: 900;
  font-size: 1.2em;
  margin: 1mm 0;
}
.store-info {
  text-align: center;
  margin: 0.5mm 0;
}
.store-info.small { font-size: 0.85em; }

/* ── جدول المنتجات ── */
.items-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.items-table thead tr {
  border-bottom: 0.3mm solid #000;
}
.items-table th,
.items-table td {
  padding: 0.8mm 0.5mm;
  vertical-align: middle;
  overflow: hidden;
  word-break: break-word;
}

/* عرض الأعمدة — يضمن عدم القطع */
.col-name  { text-align: right;  width: 40%; }
.col-qty   { text-align: center; width: 10%; }
.col-price { text-align: center; width: 22%; }
.col-total { text-align: left;   width: 28%; font-weight: 700; direction: ltr; }

.items-table th { font-weight: 900; }

/* ── جدول المجاميع ── */
.sum-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.sum-table td { padding: 0.8mm 0.5mm; vertical-align: middle; }
.sum-label {
  text-align: right;
  font-weight: 700;
  width: 50%;
}
.sum-value {
  text-align: left;
  font-weight: 900;
  width: 50%;
  direction: ltr;
}
.sum-row .sum-value {
  font-size: 1.1em;
  text-decoration: underline;
}

/* ── رسالة الشكر ── */
.welcome {
  text-align: center;
  font-weight: 700;
  margin: 1.5mm 0;
}

/* ── باركود نصي ── */
.bc-zone {
  text-align: center;
  margin: 2mm 0 1mm;
}
.bc-bars {
  font-family: "Libre Barcode 128", "Courier New", monospace;
  font-size: 24pt;
  letter-spacing: -1px;
  line-height: 1;
  overflow: hidden;
  white-space: nowrap;
}
.bc-num {
  font-family: "Courier New", monospace;
  font-size: 7pt;
  letter-spacing: 2px;
  margin-top: 0.5mm;
}
`;

    const pw = openPrintWindow(html, css, `فاتورة ${invNum}`);
    triggerPrint(pw);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  2. طباعة الباركود (Portrait — بدون تدوير)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * رسم ملصق واحد على canvas — Portrait
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} px   عرض الملصق بالبكسل
   * @param {number} py   ارتفاع الملصق بالبكسل
   * @param {object} product  { name, barcode, price }
   * @param {object} opts  { bcType, fontSize, showStore, showName, showPrice,
   *                          storeName, currency }
   */
  function _drawLabel(ctx, px, py, product, opts) {
    const { bcType, fontSize, showStore, showName, showPrice,
            storeName, currency } = opts;

    const FONT  = '"Tahoma","Arial",sans-serif';
    const PAD   = Math.max(2, Math.round(px * 0.03));  // هامش 3% من العرض
    const FS    = Math.max(6,  Math.min(40, fontSize));
    const FSS   = FS;           // اسم المتجر
    const FSP   = FS + 1;       // اسم المنتج
    const FSN   = Math.max(5, FS - 2);  // رقم الباركود
    const FSR   = FS + 2;       // السعر

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, px, py);
    ctx.fillStyle = '#000';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    let y = PAD;

    // اسم المتجر
    if (showStore && storeName) {
      ctx.font = `800 ${FSS}px ${FONT}`;
      let t = storeName;
      while (t.length > 1 && ctx.measureText(t).width > px - PAD * 2) t = t.slice(0, -1);
      if (t !== storeName) t += '…';
      ctx.fillText(t, px / 2, y);
      y += FSS + Math.ceil(PAD * 0.4);
    }

    // اسم المنتج
    if (showName && product.name) {
      ctx.font = `900 ${FSP}px ${FONT}`;
      let t = product.name;
      while (t.length > 1 && ctx.measureText(t).width > px - PAD * 2) t = t.slice(0, -1);
      if (t !== product.name) t += '…';
      ctx.fillText(t, px / 2, y);
      y += FSP + Math.ceil(PAD * 0.4);
    }

    // ── مساحة الباركود ────────────────────────────────────────────────────
    const reservedBottom = PAD
      + FSN + Math.ceil(PAD * 0.3)
      + (showPrice ? FSR + Math.ceil(PAD * 0.3) : 0);
    const bcH = Math.max(Math.round(3 * PX_PER_MM), py - y - reservedBottom - PAD);
    const bcW = px - PAD * 2;

    // رسم الباركود بـ JsBarcode
    let bcDrawn = false;
    if (typeof JsBarcode !== 'undefined' && product.barcode && bcType !== 'QR') {
      try {
        const bc    = document.createElement('canvas');
        const code  = String(product.barcode);
        const units = bcType === 'EAN13' ? 95
                    : bcType === 'EAN8'  ? 67
                    : bcType === 'UPCA'  ? 95
                    : Math.max(40, (code.length + 3) * 11 + 35);
        const xd    = Math.max(1, Math.floor(bcW / units));
        JsBarcode(bc, code, {
          format: bcType, width: xd, height: bcH,
          displayValue: false, margin: 0,
          background: '#fff', lineColor: '#000'
        });
        if (bc.width > 0 && bc.height > 0) {
          ctx.drawImage(bc, 0, 0, bc.width, bc.height, PAD, y, bcW, bcH);
          bcDrawn = true;
        }
      } catch {}
    }
    if (!bcDrawn) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth   = 1;
      ctx.strokeRect(PAD, y, bcW, bcH);
      ctx.font = `700 ${FSN}px monospace`;
      ctx.fillText('[' + (bcType || 'BC') + ']', px / 2, y + bcH / 2 - FSN / 2);
    }
    y += bcH + Math.ceil(PAD * 0.2);

    // رقم الباركود
    ctx.font = `700 ${FSN}px "Courier New",monospace`;
    const code = String(product.barcode || '');
    let codeStr = code;
    while (codeStr.length > 1 && ctx.measureText(codeStr).width > px - PAD * 2)
      codeStr = codeStr.slice(0, -1);
    ctx.fillText(codeStr, px / 2, y);
    y += FSN + Math.ceil(PAD * 0.3);

    // السعر
    // السعر — sellPrice هو الحقل الرسمي، price كاحتياطي
    const rawPrice = product.sellPrice != null ? product.sellPrice : product.price;
    if (showPrice && rawPrice != null) {
      ctx.font = `900 ${FSR}px ${FONT}`;
      const pv = parseFloat(rawPrice) || 0;
      const priceStr = `${pv % 1 === 0 ? pv.toFixed(0) : pv.toFixed(2)} ${currency}`;
      ctx.fillText(priceStr, px / 2, y);
    }
  }

  /**
   * طباعة ملصقات الباركود
   * @param {object} product
   * @param {number} copies
   */
  async function printBarcode(product, copies = 1) {
    if (!product) return;

    // ── إعدادات الملصق ────────────────────────────────────────────────────
    const rawSize  = (await cfg('barcodeSize', '40x30')).replace('×','x').replace('*','x');
    const bcType   = await cfg('barcodeType',       'CODE128');
    const fontSize = parseInt(await cfg('barcodeFontSize', '12')) || 12;
    const showStore= (await cfg('barcodeShowStore', '0')) === '1';
    const showName = (await cfg('barcodeShowName',  '1')) === '1';
    const showPrice= (await cfg('barcodeShowPrice', '1')) === '1';
    const storeName= await cfg('storeName', '');
    const currency = await cfg('currency', 'DA');

    const sz = LABEL_SIZES[rawSize] || { w: 40, h: 30 };

    // ── أبعاد الملصق بالبكسل (Portrait: العرض = sz.w, الارتفاع = sz.h) ──
    const PX = Math.round(sz.w * PX_PER_MM);
    const PY = Math.round(sz.h * PX_PER_MM);

    const opts = { bcType, fontSize, showStore, showName, showPrice,
                   storeName, currency };

    // ── رسم كل نسخة على canvas ───────────────────────────────────────────
    const canvases = [];
    const needed   = Math.max(1, Math.min(copies, 500));
    for (let i = 0; i < needed; i++) {
      const c = document.createElement('canvas');
      c.width  = PX;
      c.height = PY;
      _drawLabel(c.getContext('2d'), PX, PY, product, opts);
      canvases.push(c);
    }

    // ── تحويل كل canvas إلى <img> وبناء HTML ─────────────────────────────
    let imgTags = canvases.map(c =>
      `<img src="${c.toDataURL('image/png')}"
            width="${sz.w}mm" height="${sz.h}mm"
            style="display:block;margin:0;padding:0;"/>`
    ).join('\n');

    const html = `<div class="labels">${imgTags}</div>`;

    // ── CSS: @page بحجم الملصق الدقيق ─────────────────────────────────────
    const css = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page {
  size: ${sz.w}mm ${sz.h}mm;
  margin: 0;
}

html, body {
  width: ${sz.w}mm;
  margin: 0;
  padding: 0;
  background: #fff;
}

.labels {
  width: ${sz.w}mm;
}

img {
  display: block;
  width: ${sz.w}mm;
  height: ${sz.h}mm;
  page-break-after: always;
  break-after: page;
}
img:last-child {
  page-break-after: avoid;
  break-after: avoid;
}
`;

    const pw = openPrintWindow(html, css, `باركود: ${product.name || product.barcode}`);
    triggerPrint(pw);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  3. اختيار الطابعة
  // ══════════════════════════════════════════════════════════════════════════
  async function choosePrinter(type) {
    // في المتصفح لا يمكن اختيار الطابعة برمجياً — نفتح إعدادات Windows
    const name = prompt(
      type === 'invoice'
        ? 'أدخل اسم طابعة الفواتير (كما يظهر في Windows):'
        : 'أدخل اسم طابعة الباركود (كما يظهر في Windows):',
      ''
    );
    if (!name) return;
    const key = type === 'invoice' ? 'printerInvoice' : 'printerBarcode';
    try { await window.setSetting(key, name.trim()); } catch {}
    const cardId   = type === 'invoice' ? 'invoicePrinterCard'  : 'barcodePrinterCard';
    const nameId   = type === 'invoice' ? 'invoicePrinterName'  : 'barcodePrinterName';
    const cardEl   = document.getElementById(cardId);
    const nameEl   = document.getElementById(nameId);
    if (nameEl) nameEl.textContent = name.trim();
    if (cardEl) cardEl.classList.add('selected');
    window.toast?.show(`✅ تم حفظ الطابعة: ${name.trim()}`, 'success');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  مساعد: تنظيف HTML
  // ══════════════════════════════════════════════════════════════════════════
  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  واجهة عامة
  // ══════════════════════════════════════════════════════════════════════════
  window.printInvoice = printInvoice;

  window.POSDZ_PRINT = {
    invoice: printInvoice,
    barcode: printBarcode,
    choosePrinter,
  };

})(window);
