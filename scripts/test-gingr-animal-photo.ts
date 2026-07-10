import assert from "node:assert/strict";
import { extractPhotoUrl } from "../lib/board-utils";
import { extractGingrAnimalPhotoFromData } from "../lib/gingr-animal-photo";

assert.equal(
  extractPhotoUrl({ a_image: "/uploads/animals/beau.jpg" }),
  "https://fitdog.gingrapp.com/uploads/animals/beau.jpg"
);

assert.equal(
  extractGingrAnimalPhotoFromData([
    {
      id: "115",
      a_first: "Maggie",
      a_image: "//cdn.gingrapp.com/uploads/maggie.jpg"
    }
  ]),
  "https://cdn.gingrapp.com/uploads/maggie.jpg"
);

assert.equal(
  extractGingrAnimalPhotoFromData({
    owner_id: "8",
    animal: {
      id: "12",
      a_image: "https://fitdog.gingrapp.com/uploads/sugar.jpg"
    }
  }),
  "https://fitdog.gingrapp.com/uploads/sugar.jpg"
);

assert.equal(
  extractGingrAnimalPhotoFromData(
    {
      animals: [
        { system_id: "12", a_first: "Other" },
        { system_id: "99", a_image: "https://fitdog.gingrapp.com/uploads/maisy.jpg" }
      ]
    },
    "99"
  ),
  "https://fitdog.gingrapp.com/uploads/maisy.jpg"
);

assert.equal(
  extractGingrAnimalPhotoFromData(
    {
      results: {
        "99": {
          profile: {
            a_image: "/uploads/animals/keyed-maisy.jpg"
          }
        }
      }
    },
    "99"
  ),
  "https://fitdog.gingrapp.com/uploads/animals/keyed-maisy.jpg"
);

assert.equal(
  extractGingrAnimalPhotoFromData(
    {
      animals: [
        { a_id: "12", a_image: "/uploads/animals/wrong.jpg" },
        { a_id: "99", profile: { image_url: "/uploads/animals/right.jpg" } }
      ]
    },
    "99"
  ),
  "https://fitdog.gingrapp.com/uploads/animals/right.jpg"
);

assert.equal(extractGingrAnimalPhotoFromData({ id: "1", a_first: "No Photo" }), null);

console.log("gingr animal photo extraction tests passed");
