// app/api/grv-extract/route.ts
//
// Setup needed:
// 1. npm install @anthropic-ai/sdk
// 2. Add ANTHROPIC_API_KEY to your .env.local (get it from console.anthropic.com)
// 3. Add the same key in Vercel project settings when you deploy

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // use service role on the server only
);

const EXTRACTION_PROMPT = `You are reading a scanned Tourvest Goods Received Voucher (GRV) PDF, possibly with an attached supplier delivery note.

Extract the data and return ONLY valid JSON (no markdown, no explanation) in exactly this shape:

{
  "grv_batch_no": "",
  "trans_no": "",
  "po_no": "",
  "date_received": "YYYY-MM-DD",
  "supplier_code": "",
  "supplier_name": "",
  "warehouse": "",
  "received_by": "",
  "items": [
    {
      "item_code": "",
      "description": "",
      "po_qty": 0,
      "invoice_qty": 0,
      "received_qty": 0,
      "short_qty": 0,
      "product_batch_no": "",
      "expiry_date": "YYYY-MM-DD or empty string if not present"
    }
  ],
  "delivery_advice": {
    "doc_ref": "",
    "uid": "",
    "product_name": "",
    "cases": 0,
    "pallets": 0,
    "singles": 0,
    "pick_date": "YYYY-MM-DD or empty string"
  }
}

If the document has no attached delivery advice, set "delivery_advice" to null.
If a field is not present in the document, use an empty string (or 0 for numbers). Never invent values.`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Check if this exact filename has already been processed
    const { data: existingByFilename } = await supabase
      .from("grv_records")
      .select("id, po_no, grv_batch_no")
      .eq("source_filename", file.name)
      .maybeSingle();

    if (existingByFilename) {
      return NextResponse.json(
        {
          error: `This file was already uploaded (PO ${existingByFilename.po_no || "-"} / GRV ${existingByFilename.grv_batch_no || "-"}). Skipped to avoid duplicate.`,
        },
        { status: 409 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No text in AI response" }, { status: 500 });
    }

    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    const extracted = JSON.parse(cleaned);

    // Also check by PO number + GRV batch number, in case the same document
    // was uploaded under a different filename
    if (extracted.po_no && extracted.grv_batch_no) {
      const { data: existingByPo } = await supabase
        .from("grv_records")
        .select("id")
        .eq("po_no", extracted.po_no)
        .eq("grv_batch_no", extracted.grv_batch_no)
        .maybeSingle();

      if (existingByPo) {
        return NextResponse.json(
          {
            error: `A GRV with PO ${extracted.po_no} / batch ${extracted.grv_batch_no} already exists. Skipped to avoid duplicate.`,
          },
          { status: 409 }
        );
      }
    }

    // Insert GRV record
    const { data: grvRecord, error: grvError } = await supabase
      .from("grv_records")
      .insert({
        grv_batch_no: extracted.grv_batch_no,
        trans_no: extracted.trans_no,
        po_no: extracted.po_no,
        date_received: extracted.date_received || null,
        supplier_code: extracted.supplier_code,
        supplier_name: extracted.supplier_name,
        warehouse: extracted.warehouse,
        received_by: extracted.received_by,
        source_filename: file.name,
      })
      .select()
      .single();

    if (grvError) {
      return NextResponse.json({ error: grvError.message }, { status: 500 });
    }

    // Insert line items
    if (Array.isArray(extracted.items) && extracted.items.length > 0) {
      const itemRows = extracted.items.map((item: any) => ({
        grv_record_id: grvRecord.id,
        item_code: item.item_code,
        description: item.description,
        po_qty: item.po_qty || 0,
        invoice_qty: item.invoice_qty || 0,
        received_qty: item.received_qty || 0,
        short_qty: item.short_qty || 0,
        product_batch_no: item.product_batch_no,
        expiry_date: item.expiry_date || null,
      }));

      const { error: itemsError } = await supabase.from("grv_items").insert(itemRows);
      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 500 });
      }
    }

    // Insert delivery advice if present
    if (extracted.delivery_advice) {
      const da = extracted.delivery_advice;
      await supabase.from("delivery_advice").insert({
        grv_record_id: grvRecord.id,
        doc_ref: da.doc_ref,
        uid: da.uid,
        product_name: da.product_name,
        cases: da.cases || 0,
        pallets: da.pallets || 0,
        singles: da.singles || 0,
        pick_date: da.pick_date || null,
      });
    }

    return NextResponse.json({ success: true, grv: grvRecord, itemsCount: extracted.items?.length || 0 });
  } catch (err: any) {
    console.error("GRV extraction error:", err);
    return NextResponse.json({ error: err.message || "Extraction failed" }, { status: 500 });
  }
}