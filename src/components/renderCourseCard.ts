import { CARD_HEIGHT, CARD_MAP_HEIGHT, CARD_MAP_Y, CARD_WIDTH, cardPoint, fitCardViewport, type CourseCardModel } from '../domain/card';
import { t } from '../i18n';
import type { CardMapSnapshot } from './MapView';

interface CardColors {
  surface: string;
  text: string;
  muted: string;
  line: string;
  tileFilter: string;
}

class MapCaptureError extends Error {}

function fitText(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let short = text;
  while (short && ctx.measureText(`${short}\u2026`).width > width) short = short.slice(0, -1);
  return `${short.trimEnd()}\u2026`;
}

function drawCard(model: CourseCardModel, snapshot: CardMapSnapshot | null, colors: CardColors, withMap: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Course card canvas is unavailable');
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = colors.text;
  ctx.font = '800 48px system-ui, sans-serif';
  const words = model.name.split(/\s+/);
  let first = '';
  while (words.length && ctx.measureText(`${first} ${words[0]}`.trim()).width <= 984) first = `${first} ${words.shift()}`.trim();
  ctx.fillText(fitText(ctx, first || words.shift() || '', 984), 48, 68);
  if (words.length) ctx.fillText(fitText(ctx, words.join(' '), 984), 48, 126);
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillStyle = colors.muted;
  ctx.fillText(fitText(ctx, model.status, 984), 48, 162);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, CARD_MAP_Y, CARD_WIDTH, CARD_MAP_HEIGHT);
  ctx.clip();
  const viewport = withMap && snapshot ? snapshot : fitCardViewport(model.paths);
  if (withMap && snapshot) {
    ctx.filter = colors.tileFilter;
    try {
      for (const tile of snapshot.tiles) {
        ctx.drawImage(tile.image, tile.x / snapshot.width * CARD_WIDTH, CARD_MAP_Y + tile.y / snapshot.height * CARD_MAP_HEIGHT,
          256 / snapshot.width * CARD_WIDTH, 256 / snapshot.height * CARD_MAP_HEIGHT);
      }
    } catch (error) {
      throw new MapCaptureError('Visible map tiles could not be drawn', { cause: error });
    }
    ctx.filter = 'none';
  }
  if (viewport) {
    for (const path of model.paths) {
      ctx.beginPath();
      path.coordinates.forEach((point, index) => {
        const [x, y] = cardPoint(point, viewport);
        if (index) ctx.lineTo(x, y + CARD_MAP_Y);
        else ctx.moveTo(x, y + CARD_MAP_Y);
      });
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = path.color?.toLowerCase() === '#ffffff' ? '#003f58' : colors.surface;
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.strokeStyle = path.color ?? colors.line;
      ctx.lineWidth = 9;
      ctx.stroke();
    }
    for (const [point, color] of [[model.start, '#2e9e4f'], [model.end, '#d6342c']] as const) {
      if (!point) continue;
      const [x, y] = cardPoint(point, viewport);
      ctx.beginPath();
      ctx.arc(x, y + CARD_MAP_Y, 13, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.fillStyle = '#003f58';
  ctx.fillRect(0, 942, CARD_WIDTH, 38);
  ctx.fillStyle = '#fff';
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText(t('courseCard.attribution'), 24, 969);
  if (!withMap) {
    ctx.fillStyle = colors.surface;
    ctx.fillRect(24, 204, 1032, 42);
    ctx.fillStyle = colors.text;
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText(fitText(ctx, t('courseCard.routeOnly'), 984), 48, 234);
  }

  ctx.fillStyle = colors.text;
  ctx.font = '800 50px system-ui, sans-serif';
  ctx.fillText(fitText(ctx, model.distance, 984), 48, 1044);
  ctx.font = '700 26px system-ui, sans-serif';
  let x = 48, y = 1082;
  for (let i = 0; i < model.badges.length; i++) {
    const badge = model.badges[i];
    const text = fitText(ctx, badge.text, 210);
    const width = ctx.measureText(text).width + 30;
    const reserve = i < model.badges.length - 1 ? 100 : 0;
    if (x + width + reserve > 1032 && y === 1082) { x = 48; y += 54; }
    if (x + width + reserve > 1032 || i === 12) {
      ctx.fillStyle = colors.text;
      ctx.fillText(t('courseCard.moreLegs', { n: model.badges.length - i }), x, y + 32);
      break;
    }
    ctx.fillStyle = badge.color ?? colors.line;
    ctx.fillRect(x, y, width, 44);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#003f58';
    ctx.lineWidth = 4;
    ctx.strokeText(text, x + 15, y + 31);
    ctx.fillText(text, x + 15, y + 31);
    x += width + 10;
  }
  ctx.fillStyle = colors.text;
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText(fitText(ctx, `${t('strip.start')}: ${model.startName}`, 984), 48, 1210);
  ctx.fillText(fitText(ctx, `${t('courseCard.end')}: ${model.endName}`, 984), 48, 1246);
  ctx.fillStyle = colors.muted;
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText(fitText(ctx, model.runners, 984), 48, 1286);
  ctx.fillStyle = colors.text;
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(fitText(ctx, model.appName, 984), 48, 1330);
  return canvas;
}

const toPng = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Course card PNG encoding failed')), 'image/png');
});

export async function renderCourseCard(model: CourseCardModel, snapshot: CardMapSnapshot | null): Promise<{ blob: Blob; routeOnly: boolean }> {
  const style = getComputedStyle(document.documentElement);
  const colors: CardColors = {
    surface: style.getPropertyValue('--surface').trim(), text: style.getPropertyValue('--text').trim(),
    muted: style.getPropertyValue('--muted').trim(), line: style.getPropertyValue('--line').trim(),
    tileFilter: snapshot?.filter || 'none',
  };
  if (snapshot?.complete) {
    try {
      return { blob: await toPng(drawCard(model, snapshot, colors, true)), routeOnly: false };
    } catch (error) {
      if (!(error instanceof MapCaptureError) && !(error instanceof DOMException && error.name === 'SecurityError')) throw error;
      console.warn('Course card map capture failed; using a fresh route-only canvas:', error);
    }
  } else {
    console.warn('Course card visible tiles are incomplete; using a route-only canvas');
  }
  return { blob: await toPng(drawCard(model, null, colors, false)), routeOnly: true };
}
