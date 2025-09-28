// // src/api/checkout/controllers/checkout.js
// "use strict";

// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// module.exports = {
//     async create(ctx) {
//         try {
//             const { cartItems = [], email, userId } = ctx.request.body || {};

//             // ❌ Block if no userId (no guest checkout allowed)
//             if (!userId) return ctx.badRequest("Login required to checkout");
//             if (!cartItems.length) return ctx.badRequest("Cart is empty");
//             if (!email) return ctx.badRequest("Email is required");

//             // 🛒 Build Stripe line items
//             const line_items = cartItems.map((item) => ({
//                 price_data: {
//                     currency: "inr",
//                     product_data: {
//                         name: item.title,
//                         images: item.image ? [item.image] : [],
//                     },
//                     unit_amount: Math.round(Number(item.price) * 100), // convert to paise
//                 },
//                 quantity: Number(item.quantity || 1),
//             }));

//             // ✅ Create checkout session
//             const session = await stripe.checkout.sessions.create({
//                 mode: "payment",
//                 payment_method_types: ["card"], // add UPI support too
//                 line_items,
//                 customer_email: email,
//                 billing_address_collection: "required",
//                 phone_number_collection: { enabled: true },

//                 success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
//                 cancel_url: `${process.env.FRONTEND_URL}/cancel`,

//                 // Attach Strapi-specific metadata (required for webhook)
//                 metadata: {
//                     userId: String(userId),
//                     email,
//                     cart: JSON.stringify(
//                         cartItems.map((item) => ({
//                             id: item.id,
//                             title: item.title,
//                             quantity: item.quantity,
//                             price: item.price,
//                         }))
//                     ),
//                 },
//             });

//             ctx.body = { url: session.url, id: session.id };
//         } catch (err) {
//             strapi.log.error("❌ Stripe Checkout Error:", err);
//             return ctx.internalServerError("Unable to create checkout session");
//         }
//     },
// };


// "use strict";

// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// module.exports = {
//     async create(ctx) {
//         try {
//             const { cartItems = [], email, userId } = ctx.request.body || {};

//             // ❌ Block if no userId (no guest checkout allowed)
//             if (!userId) return ctx.badRequest("Login required to checkout");
//             if (!cartItems.length) return ctx.badRequest("Cart is empty");
//             if (!email) return ctx.badRequest("Email is required");

//             // 🛒 Build Stripe line items
//             const line_items = cartItems.map((item) => ({
//                 price_data: {
//                     currency: "inr",
//                     product_data: {
//                         name: item.title,
//                         images: item.image ? [item.image] : [],
//                         metadata: {
//                             productId: String(item.id), // 👈 attach Strapi productId here
//                         },
//                     },
//                     unit_amount: Math.round(Number(item.price) * 100), // convert INR → paise
//                 },
//                 quantity: Number(item.quantity || 1),
//             }));

//             // ✅ Create checkout session
//             const session = await stripe.checkout.sessions.create({
//                 mode: "payment",
//                 payment_method_types: ["card"], // added UPI support
//                 line_items,
//                 customer_email: email,
//                 billing_address_collection: "required",
//                 phone_number_collection: { enabled: true },

//                 success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
//                 cancel_url: `${process.env.FRONTEND_URL}/cancel`,

//                 // Attach global metadata for webhook
//                 metadata: {
//                     userId: String(userId),
//                     email,
//                 },
//             });

//             ctx.body = { url: session.url, id: session.id };
//         } catch (err) {
//             strapi.log.error("❌ Stripe Checkout Error:", err);
//             return ctx.internalServerError("Unable to create checkout session");
//         }
//     },
// };




// src/api/checkout/controllers/checkout.js
"use strict";

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

module.exports = {
  async create(ctx) {
    try {
      const { cartItems = [], email, userId } = ctx.request.body || {};

      // ❌ No guest checkout
      if (!userId) return ctx.badRequest("Login required to checkout");
      if (!cartItems.length) return ctx.badRequest("Cart is empty");
      if (!email) return ctx.badRequest("Email is required");

      // 🛒 Build Stripe line items with productId in metadata
      const line_items = cartItems.map((item) => ({
        price_data: {
          currency: "inr",
          product_data: {
            name: item.title,
            images: item.image ? [item.image] : [],
            metadata: {
              productId: String(item.id), // 🔑 send Strapi productId
            },
          },
          unit_amount: Math.round(Number(item.price) * 100), // ₹ → paise
        },
        quantity: Number(item.quantity || 1),
      }));

      // ✅ Create checkout session
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"], // added UPI support
        line_items,
        customer_email: email,
        billing_address_collection: "required",
        phone_number_collection: { enabled: true },

        success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/cancel`,

        // Attach order-level metadata
        metadata: {
          userId: String(userId),
          email,
          cart: JSON.stringify(
            cartItems.map((item) => ({
              id: item.id,
              title: item.title,
              quantity: item.quantity,
              price: item.price,
            }))
          ),
        },
      });

      ctx.body = { url: session.url, id: session.id };
    } catch (err) {
      strapi.log.error("❌ Stripe Checkout Error:", err);
      return ctx.internalServerError("Unable to create checkout session");
    }
  },
};
