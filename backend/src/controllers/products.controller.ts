/** Products the signed-in user may work in. */
import { accessSnapshot } from '../services/access.service';
import { normalizeProduct, rawProductSchema } from '../dto/product.dto';
import { byComponent, getSubcomponents } from '../services/subcomponents.service';
import { asyncHandler, sendSuccess } from '../helpers/response.helper';
import { env } from '../config/app.config';

export const listProducts = asyncHandler(async (req, res) => {
  const [{ products, names }, subcomponents] = await Promise.all([
    accessSnapshot(req.bugzilla!, req.sessionUser!.bzUserId),
    getSubcomponents(env),
  ]);
  const grouped = byComponent(subcomponents);
  const normalized = products.map((product) => normalizeProduct(rawProductSchema.parse(product), grouped));

  if (req.query.scope === 'filing') {
    sendSuccess(res, { products: normalized });
    return;
  }

  const visible = names === null ? normalized : normalized.filter((product) => names.includes(product.name));
  sendSuccess(res, { products: visible });
});
