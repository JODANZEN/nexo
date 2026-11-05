import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

export interface PazSalvoData {
  conjuntoName: string;
  unitNumber: string;
  residentName: string | null;
  dateLabel: string;
}

const s = StyleSheet.create({
  page: { padding: 56, fontSize: 11, fontFamily: 'Helvetica', lineHeight: 1.6 },
  title: { fontSize: 20, marginBottom: 24, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  meta: { marginBottom: 4, color: '#222' },
  body: { marginTop: 20 },
  footer: { marginTop: 48, color: '#444' },
});

const e = React.createElement;

// Paz y Salvo certificate as a Buffer. No JSX — plain React.createElement.
export function buildPazSalvoPdf(data: PazSalvoData): Promise<Buffer> {
  const doc = e(
    Document,
    null,
    e(
      Page,
      { size: 'A4', style: s.page },
      e(Text, { style: s.title }, 'Certificado de Paz y Salvo'),
      e(Text, { style: s.meta }, `Conjunto: ${data.conjuntoName}`),
      e(Text, { style: s.meta }, `Unidad: ${data.unitNumber}`),
      e(Text, { style: s.meta }, `Residente: ${data.residentName ?? 'N/A'}`),
      e(Text, { style: s.meta }, `Fecha de expedición: ${data.dateLabel}`),
      e(
        View,
        { style: s.body },
        e(
          Text,
          null,
          `La administración del ${data.conjuntoName} certifica que la unidad ${data.unitNumber} se encuentra a PAZ Y SALVO por concepto de cuotas de administración a la fecha de expedición de este documento.`,
        ),
      ),
      e(
        Text,
        { style: s.footer },
        'Este certificado se expide a solicitud del interesado. Su validez está sujeta a la fecha de expedición.',
      ),
    ),
  );
  return renderToBuffer(doc);
}
