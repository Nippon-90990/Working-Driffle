// 'use strict';


// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// const { v4: uuidv4 } = require('uuid');

// module.exports = {
//   async webhook(ctx) {
//     const sig = ctx.request.headers['stripe-signature'];
//     const raw = Buffer.from(
//       ctx.request.body[Symbol.for('unparsedBody')],
//       'utf8'
//     );

//     let event;
//     try {
//       event = stripe.webhooks.constructEvent(
//         raw,
//         sig,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );
//     } catch (err) {
//       strapi.log.error(`❌ Webhook signature verification failed: ${err.message}`);
//       return ctx.badRequest('Webhook signature failed');
//     }

//     if (event.type === 'checkout.session.completed') {
//       const session = event.data.object;
//       strapi.log.info(`🎉 Checkout Session Completed: ${session.id}`);

//       try {
//         // ✅ Require userId (no guest checkout allowed)
//         const userId = session.metadata?.userId;
//         if (!userId) {
//           throw new Error("❌ Checkout session missing userId in metadata.");
//         }

//         // 1️⃣ Fetch line items
//         const lineItems = await stripe.checkout.sessions.listLineItems(session.id);

//         // 2️⃣ Prepare product snapshot for order
//         const productSnapshot = lineItems.data.map((item) => ({
//           name: item.description,
//           quantity: item.quantity,
//           amount_total: item.amount_total / 100,
//           currency: item.currency,
//         }));

//         // 3️⃣ Create order in Strapi (status = "paid" since Stripe confirms payment)
//         const order = await strapi.entityService.create('api::order.order', {
//           data: {
//             orderNumber: `ORD-${uuidv4().split('-')[0]}`,
//             status: 'paid', // 👈 must match your Strapi ENUM
//             totalAmount: session.amount_total / 100,
//             currency: (session.currency || 'inr').toUpperCase(),
//             paymentMethod: session.payment_method_types?.[0] || 'card',
//             paymentProvider: 'stripe',
//             paymentStatus: 'paid',
//             stripeSessionId: session.id,
//             stripePaymentIntentId: session.payment_intent,
//             deliveryEmail: session.customer_details?.email,
//             keysDelivered: false,
//             productSnapshot,
//             user: userId, // ✅ Always linked to a valid Strapi user
//             notes: session.metadata?.notes || null,
//           },
//         });

//         // 4️⃣ Auto-assign game keys
//         const assignedKeys = [];
//         for (const item of lineItems.data) {
//           const productTitle = item.description;
//           const qty = item.quantity || 1;

//           const products = await strapi.entityService.findMany('api::product.product', {
//             filters: { title: productTitle },
//             populate: { gameKeys: true },
//           });

//           if (products?.length) {
//             const product = products[0];
//             const availableKeys = product.gameKeys.filter(k => !k.isUsed).slice(0, qty);

//             for (const key of availableKeys) {
//               await strapi.entityService.update('api::game-key.game-key', key.id, {
//                 data: { isUsed: true, order: order.id },
//               });
//               assignedKeys.push({ product: productTitle, key: key.code });
//             }
//           }
//         }

//         // 5️⃣ Send email with assigned keys
//         if (assignedKeys.length && session.customer_details?.email) {
//           await strapi.service('api::order.order').sendKeysEmail(
//             session.customer_details.email,
//             assignedKeys,
//             order
//           );
//         }

//         // 6️⃣ Mark order as delivered
//         await strapi.entityService.update('api::order.order', order.id, {
//           data: { keysDelivered: true },
//         });

//         strapi.log.info(`✅ Order created + keys delivered for session ${session.id}`);
//       } catch (err) {
//         strapi.log.error('❌ Webhook order/key flow failed:', err);
//         return ctx.internalServerError('Failed to process order');
//       }
//     } else {
//       strapi.log.info(`Ignored event type: ${event.type}`);
//     }

//     ctx.send({ received: true });
//   },
// };






// ./src/api/order/controllers/order.js

// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// const { Resend } = require('resend');

// const resend = new Resend(process.env.RESEND_API_KEY);

// module.exports = {
//   async webhook(ctx) {
//     const sig = ctx.request.headers['stripe-signature'];
//     let event;

//     try {
//       event = stripe.webhooks.constructEvent(
//         ctx.request.rawBody,
//         sig,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );
//     } catch (err) {
//       ctx.throw(400, `Webhook Error: ${err.message}`);
//     }

//     if (event.type === 'checkout.session.completed') {
//       const session = event.data.object;

//       try {
//         // Find registered user
//         const user = await strapi.db.query('plugin::users-permissions.user').findOne({
//           where: { email: session.customer_email },
//         });

//         if (!user) {
//           throw new Error('User not found – guest checkout disabled');
//         }

//         // Create order in Strapi
//         const order = await strapi.entityService.create('api::order.order', {
//           data: {
//             orderNumber: session.id,
//             totalAmount: session.amount_total / 100,
//             currency: session.currency.toUpperCase(),
//             paymentMethod: session.payment_method_types[0],
//             paymentProvider: 'stripe',
//             stripeSessionId: session.id,
//             stripePaymentIntentId: session.payment_intent,
//             deliveryEmail: session.customer_email,
//             paymentStatus: 'paid',
//             status: 'completed',
//             user: user.id,
//           },
//         });

//         // Collect assigned keys for email
//         let deliveredKeys = [];

//         // Assign game keys
//         const cartItems = session.metadata?.cartItems
//           ? JSON.parse(session.metadata.cartItems)
//           : [];

//         for (const item of cartItems) {
//           const gameKey = await strapi.db.query('api::game-key.game-key').findOne({
//             where: { product: item.productId, isUsed: false },
//           });

//           if (gameKey) {
//             await strapi.db.query('api::game-key.game-key').update({
//               where: { id: gameKey.id },
//               data: { isUsed: true },
//             });

//             await strapi.entityService.create('api::order-item.order-item', {
//               data: {
//                 quantity: item.quantity,
//                 price: item.price,
//                 product: item.productId,
//                 gameKey: gameKey.id,
//                 order: order.id,
//               },
//             });

//             deliveredKeys.push({
//               productId: item.productId,
//               key: gameKey.key,
//             });
//           }
//         }

//         // Update order delivery info
//         await strapi.entityService.update('api::order.order', order.id, {
//           data: {
//             deliveryStatus: 'delivered',
//             gameKeysAssigned: true,
//             deliveredAt: new Date(),
//           },
//         });

//         // ✅ Send Email with Resend
//         if (deliveredKeys.length > 0) {
//           const keyList = deliveredKeys
//             .map((k, i) => `<li><strong>Game ${i + 1}:</strong> ${k.key}</li>`)
//             .join('');

//           await resend.emails.send({
//             from: 'no-reply@yourstore.com',
//             to: session.customer_email,
//             subject: 'Your Game Keys - Order #' + order.orderNumber,
//             html: `
//               <h2>Thank you for your purchase!</h2>
//               <p>Here are your game keys:</p>
//               <ul>${keyList}</ul>
//               <p>You can also view this in your account dashboard.</p>
//             `,
//           });
//         }

//         strapi.log.info(`✅ Order ${order.orderNumber} created, keys delivered & emailed.`);
//       } catch (error) {
//         strapi.log.error('❌ Webhook processing failed:', error);
//       }
//     }

//     ctx.send({ received: true });
//   },
// };





// // src/api/order/controllers/order.js   this code is working fine
// "use strict";

// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// const { v4: uuidv4 } = require("uuid");

// module.exports = {
//   async webhook(ctx) {
//     const sig = ctx.request.headers["stripe-signature"];
//     const raw = Buffer.from(ctx.request.body[Symbol.for("unparsedBody")], "utf8");

//     let event;
//     try {
//       event = stripe.webhooks.constructEvent(
//         raw,
//         sig,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );
//     } catch (err) {
//       strapi.log.error(`❌ Stripe signature verification failed: ${err.message}`);
//       return ctx.badRequest("Webhook Error");
//     }

//     if (event.type === "checkout.session.completed") {
//       const session = event.data.object;
//       strapi.log.info(`🎉 Checkout completed: ${session.id}`);

//       try {
//         // 👤 Must have userId
//         const userId = session.metadata?.userId;
//         if (!userId) {
//           throw new Error("Session missing userId in metadata.");
//         }

//         // 📦 Fetch line items from Stripe
//         const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
//           expand: ["data.price.product"],
//         });

//         // 🧾 Create the order
//         const order = await strapi.entityService.create("api::order.order", {
//           data: {
//             orderNumber: `ORD-${uuidv4().split("-")[0]}`,
//             // totalAmount: session.amount_total / 100,
//             totalAmount: Math.round(session.amount_total / 100),
//             currency: (session.currency || "INR").toUpperCase(),
//             paymentMethod: session.payment_method_types?.[0] || "card",
//             paymentProvider: "stripe",
//             paymentStatus: "paid",
//             stripeSessionId: session.id,
//             stripePaymentIntentId: session.payment_intent,
//             deliveryEmail: session.customer_details?.email,
//             status: "processing", // 👈 matches your ENUM
//             deliveryStatus: "pending",
//             user: userId,
//             notes: session.metadata?.notes || null,
//           },
//         });

//         // 🛒 Create order items
//         for (const item of lineItems.data) {
//           // Try to match product by title
//           const products = await strapi.entityService.findMany(
//             "api::product.product",
//             { filters: { title: item.description }, populate: { gameKeys: true } }
//           );

//           let assignedKeys = [];
//           if (products?.length) {
//             const product = products[0];
//             const availableKeys = product.gameKeys
//               .filter((k) => !k.isUsed)
//               .slice(0, item.quantity);

//             for (const key of availableKeys) {
//               await strapi.entityService.update("api::game-key.game-key", key.id, {
//                 data: { isUsed: true, order: order.id },
//               });
//               assignedKeys.push({ code: key.code });
//             }
//           }

//           await strapi.entityService.create("api::order-item.order-item", {
//             data: {
//               order: order.id,
//               product: products?.[0]?.id || null,
//               quantity: item.quantity,
//               priceAtPurchase: item.amount_total / 100,
//               snapshot: {
//                 name: item.description,
//                 currency: item.currency,
//               },
//               assignedKeys,
//               deliveryStatus: assignedKeys.length ? "delivered" : "pending",
//             },
//           });
//         }

//         // 📧 Optionally send email with keys
//         // await strapi.service("api::order.order").sendKeysEmail(
//         //   session.customer_details.email,
//         //   assignedKeys,
//         //   order
//         // );

//         strapi.log.info(`✅ Order ${order.orderNumber} created in Strapi.`);
//       } catch (err) {
//         strapi.log.error("❌ Webhook order creation failed:", err);
//         return ctx.internalServerError("Order creation failed");
//       }
//     } else {
//       strapi.log.info(`Ignored Stripe event: ${event.type}`);
//     }

//     ctx.send({ received: true });
//   },
// };



// "use strict";

// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// module.exports = {
//   async webhook(ctx) {
//     const sig = ctx.request.headers["stripe-signature"];
//     const raw = Buffer.from(ctx.request.body[Symbol.for("unparsedBody")], "utf8");

//     let event;
//     try {
//       event = stripe.webhooks.constructEvent(
//         raw,
//         sig,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );
//     } catch (err) {
//       strapi.log.error(`❌ Stripe signature verification failed: ${err.message}`);
//       return ctx.badRequest("Webhook Error");
//     }

//     if (event.type === "checkout.session.completed") {
//       const session = event.data.object;
//       strapi.log.info(`🎉 Checkout completed: ${session.id}`);

//       try {
//         const userId = session.metadata?.userId;
//         if (!userId) throw new Error("Session missing userId in metadata.");

//         // 📦 Fetch line items from Stripe
//         const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
//           expand: ["data.price.product"],
//         });

//         // 🧾 Create Order
//         const order = await strapi.db.query("api::order.order").create({
//           data: {
//             orderNumber: `ORD-${Date.now()}`,
//             totalAmount: session.amount_total,
//             currency: session.currency.toUpperCase(),
//             paymentMethod: session.payment_method_types[0],
//             paymentProvider: "stripe",
//             paymentStatus: "paid",
//             stripeSessionId: session.id,
//             stripePaymentIntentId: session.payment_intent,
//             deliveryEmail: session.customer_email,
//             user: userId,
//           },
//         });

//         // 🛒 Create Order Items
//         for (const item of lineItems.data) {
//           const productId = item.price?.product?.metadata?.productId;

//           if (!productId) {
//             strapi.log.warn(`⚠️ No productId metadata for item ${item.description}`);
//             continue;
//           }

//           // Fetch product for game keys + snapshot
//           const product = await strapi.entityService.findOne(
//             "api::product.product",
//             productId,
//             { populate: { gameKeys: true, coverImage: true } }
//           );

//           // Assign keys if available
//           let assignedKeys = [];
//           if (product?.gameKeys?.length) {
//             const availableKeys = product.gameKeys
//               .filter((k) => !k.isUsed)
//               .slice(0, item.quantity);

//             for (const key of availableKeys) {
//               await strapi.entityService.update("api::game-key.game-key", key.id, {
//                 data: { isUsed: true, order: order.id },
//               });
//               assignedKeys.push({ code: key.code });
//             }
//           }

//           // Create order-item
//           for (const item of cartItems) {
//             await strapi.db.query("api::order-item.order-item").create({
//               data: {
//                 order: order.id,
//                 product: item.id,
//                 quantity: item.quantity,
//                 priceAtPurchase: Math.round(Number(item.price) * 100),
//                 currency: "INR",
//                 snapshot: {
//                   title: item.title,
//                   image: item.image,
//                   platform: item.platform,
//                 },
//               },
//             });
//           }
//         }

//         strapi.log.info(`✅ Order ${order.orderNumber} created with items.`);
//       } catch (err) {
//         strapi.log.error("❌ Webhook order creation failed:", err);
//         return ctx.internalServerError("Order creation failed");
//       }
//     } else {
//       strapi.log.info(`Ignored Stripe event: ${event.type}`);
//     }

//     ctx.send({ received: true });
//   },
// };



// "use strict";

// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// module.exports = {
//   async webhook(ctx) {
//     const sig = ctx.request.headers["stripe-signature"];
//     const raw = Buffer.from(ctx.request.body[Symbol.for("unparsedBody")], "utf8");

//     let event;
//     try {
//       event = stripe.webhooks.constructEvent(
//         raw,
//         sig,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );
//     } catch (err) {
//       strapi.log.error(`❌ Stripe signature verification failed: ${err.message}`);
//       return ctx.badRequest("Webhook Error");
//     }

//     if (event.type === "checkout.session.completed") {
//       const session = event.data.object;
//       strapi.log.info(`🎉 Checkout completed: ${session.id}`);

//       try {
//         const userId = session.metadata?.userId;
//         if (!userId) throw new Error("Session missing userId in metadata.");

//         // cartItems stored in checkout create
//         const cartItems = JSON.parse(session.metadata.cart || "[]");
//         strapi.log.info(`📦 Cart Items: ${JSON.stringify(cartItems)}`);

//         // 🧾 Create Order
//         const order = await strapi.entityService.create("api::order.order", {
//           data: {
//             orderNumber: `ORD-${Date.now()}`,
//             totalAmount: session.amount_total, // already in paise
//             currency: session.currency?.toUpperCase() || "INR",
//             paymentMethod: session.payment_method_types?.[0] || "card",
//             paymentProvider: "stripe",
//             paymentStatus: "paid",
//             stripeSessionId: session.id,
//             stripePaymentIntentId: session.payment_intent,
//             deliveryEmail: session.customer_email,
//             user: userId,
//           },
//         });

//         // 🛒 Create Order Items
//         for (const item of cartItems) {
//           try {
//             const product = await strapi.entityService.findOne(
//               "api::product.product",
//               item.id,
//               { populate: { gameKeys: true, coverImage: true } }
//             );

//             // Assign keys
//             let assignedKeys = [];
//             if (product?.gameKeys?.length) {
//               const availableKeys = product.gameKeys
//                 .filter((k) => !k.isUsed)
//                 .slice(0, item.quantity);

//               for (const key of availableKeys) {
//                 await strapi.entityService.update("api::game-key.game-key", key.id, {
//                   data: { isUsed: true, order: order.id },
//                 });
//                 assignedKeys.push({ code: key.code });
//               }
//             }

//             // ✅ Proper relation format
//             await strapi.entityService.create("api::order-item.order-item", {
//               data: {
//                 order: { connect: [order.id] },
//                 product: { connect: [item.id] },
//                 quantity: item.quantity,
//                 priceAtPurchase: Math.round(Number(item.price) * 100), // paise
//                 currency: session.currency?.toUpperCase() || "INR",
//                 snapshot: {
//                   title: item.title,
//                   image:
//                     product?.coverImage?.url ||
//                     item.image ||
//                     null, // safe fallback
//                 },
//                 assignedKeys,
//                 deliveryStatus: assignedKeys.length ? "delivered" : "pending",
//               },
//             });

//             strapi.log.info(
//               `✅ Order item created for product ${item.id} (qty=${item.quantity})`
//             );
//           } catch (err) {
//             strapi.log.error(
//               `❌ Failed creating order-item for productId=${item.id}: ${err.message}`
//             );
//           }
//         }

//         strapi.log.info(
//           `✅ Order ${order.orderNumber} created with ${cartItems.length} items.`
//         );
//       } catch (err) {
//         strapi.log.error("❌ Webhook order creation failed:", err);
//         return ctx.internalServerError("Order creation failed");
//       }
//     } else {
//       strapi.log.info(`Ignored Stripe event: ${event.type}`);
//     }

//     ctx.send({ received: true });
//   },
// };


// Updated code after new schema changes CartItems to Order Collection
// src/api/order/controllers/order.js
"use strict";

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = {
  async webhook(ctx) {
    const sig = ctx.request.headers["stripe-signature"];
    const raw = Buffer.from(ctx.request.body[Symbol.for("unparsedBody")], "utf8");

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        raw,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      strapi.log.error(`❌ Stripe signature verification failed: ${err.message}`);
      return ctx.badRequest("Webhook Error");
    }

    if (event.type !== "checkout.session.completed") {
      strapi.log.info(`Ignored Stripe event: ${event.type}`);
      return ctx.send({ received: true });
    }

    const session = event.data.object;
    strapi.log.info(`🎉 Checkout completed: ${session.id}`);

    try {
      const userId = session.metadata?.userId;
      if (!userId) throw new Error("Session missing userId in metadata.");

      const cartItems = JSON.parse(session.metadata.cart || "[]");
      if (!Array.isArray(cartItems) || cartItems.length === 0) {
        throw new Error("Cart metadata missing or invalid.");
      }

      // 1. Create Order
      const order = await strapi.entityService.create("api::order.order", {
        data: {
          orderNumber: `ORD-${Date.now()}`,
          totalAmount: session.amount_total,
          currency: session.currency?.toUpperCase() || "INR",
          paymentMethod: session.payment_method_types?.[0] || "card",
          paymentProvider: "stripe",
          paymentStatus: "paid",
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent,
          deliveryEmail: session.customer_email,
          user: userId,
          cartSnapshot: cartItems, // ✅ save cart JSON
          status: "processing",
          deliveryStatus: "pending",
        },
      });

      strapi.log.info(
        `✅ Order ${order.orderNumber} created with ${cartItems.length} items.`
      );

      // 2. Assign Game Keys
      let assignedKeys = [];
      for (const item of cartItems) {
        const product = await strapi.db.query("api::product.product").findOne({
          where: { title: item.title },
          populate: { gameKeys: true },
        });

        if (!product) {
          strapi.log.warn(`⚠️ Product not found: ${item.title}`);
          continue;
        }

        const availableKeys = product.gameKeys.filter(k => k.isAvailable);
        const keysToAssign = availableKeys.slice(0, item.quantity);

        if (keysToAssign.length < item.quantity) {
          strapi.log.warn(
            `⚠️ Not enough keys for ${item.title}. Needed: ${item.quantity}, got: ${keysToAssign.length}`
          );
        }

        for (const key of keysToAssign) {
          await strapi.db.query("api::game-key.game-key").update({
            where: { id: key.id },
            data: { isAvailable: false, assignedAt: new Date() },
          });

          assignedKeys.push({ product: product.title, key: key.code });
        }
      }

      // 3. Update Order Delivery Info
      await strapi.db.query("api::order.order").update({
        where: { id: order.id },
        data: {
          deliveryStatus: assignedKeys.length > 0 ? "delivered" : "pending",
          gameKeysAssigned: assignedKeys.length > 0,
          deliveredAt: assignedKeys.length > 0 ? new Date() : null,
          assignedKeys, // ✅ save assigned keys JSON
        },
      });

      // 4. Send Email with Keys
      // if (order.deliveryEmail && assignedKeys.length > 0) {
      //   const keysHtml = assignedKeys
      //     .map(k => `<p><strong>${k.product}</strong>: ${k.key}</p>`)
      //     .join("");

      //   await resend.emails.send({
      //     from: "onboarding@resend.dev",
      //     to: order.deliveryEmail,
      //     subject: `Your Game Keys - Order #${order.orderNumber}`,
      //     html: `
      //       <h2>Thank you for your purchase!</h2>
      //       <p>Here are your keys:</p>
      //       ${keysHtml}
      //     `,
      //   });

      //   strapi.log.info(`📩 Keys sent to ${order.deliveryEmail}`);
      // } else {
      //   strapi.log.warn("⚠️ No keys assigned, email skipped.");
      // }

      // 4. Send Email with Keys
      if (order.deliveryEmail && assignedKeys.length > 0) {
        const orderDate = new Date().toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });

        const itemsHtml = cartItems
          .map(
            (item) => {
              const keysForProduct = assignedKeys
                .filter((k) => k.product === item.title)
                .map((k) => `<span style="color:#008000;">${k.key}</span>`)
                .join("<br/>");

              return `
        <tr>
          <td style="padding:15px; border-bottom:1px solid #eee;">
            <strong>${item.title}</strong><br/>
            Quantity: ${item.quantity}<br/>
            Price: ₹${item.price}<br/>
            Keys:<br/> ${keysForProduct}
          </td>
        </tr>`;
            }
          )
          .join("");

        const htmlTemplate = `
  <html>
    <body style="font-family: Arial, sans-serif; background:#ffffff; margin:0; padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; margin:0 auto;">
              
              <!-- Header -->
              <tr>
                <td style="padding:20px; text-align:left;">
                  <img src="https://yourcdn.com/logo.png" alt="Logo" height="30"/>
                </td>
                <td style="padding:20px; text-align:right; font-size:12px; color:#555;">
                  ${orderDate}
                </td>
              </tr>

              <!-- Hero -->
              <tr>
                <td colspan="2" style="padding:20px; text-align:center;">
                  <h2 style="margin:0; font-size:22px; color:#000;">Here are your keys 🎉</h2>
                  <p style="font-size:14px; color:#555; line-height:20px;">
                    Thank you for your purchase. Below are your game keys.
                  </p>
                  <a href="${process.env.FRONTEND_URL}/orders/${order.id}"
                     style="display:inline-block; padding:12px 24px; background:#000; color:#fff; text-decoration:none; font-weight:bold; border-radius:4px;">
                    View Order
                  </a>
                </td>
              </tr>

              <!-- Order Info -->
              <tr>
                <td colspan="2" style="padding:20px; border-top:1px solid #eee; border-bottom:1px solid #eee;">
                  <table width="100%">
                    <tr>
                      <td style="font-size:14px; color:#555;">
                        <strong style="color:#000;">Order number</strong><br/> ${order.orderNumber}
                      </td>
                      <td style="font-size:14px; color:#555; text-align:right;">
                        <strong style="color:#000;">Order date</strong><br/> ${orderDate}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Items -->
              ${itemsHtml}

              <!-- Footer -->
              <tr>
                <td colspan="2" style="background:#000; color:#fff; padding:20px; font-size:12px; text-align:center;">
                  <p style="margin:0;">📩 For support, contact us at 
                    <a href="mailto:support@yourbrand.com" style="color:#fff;">support@yourbrand.com</a>
                  </p>
                  <p style="margin:10px 0 0;">&copy; 2025 YourBrand. All rights reserved.</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

        await resend.emails.send({
          from: "onboarding@resend.dev",
          to: order.deliveryEmail,
          subject: `Your Game Keys - Order #${order.orderNumber}`,
          html: htmlTemplate,
        });

        strapi.log.info(`📩 Fancy email sent to ${order.deliveryEmail}`);
      } else {
        strapi.log.warn("⚠️ No keys assigned, email skipped.");
      }

    } catch (err) {
      strapi.log.error("❌ Webhook order handling failed:", err);
      return ctx.internalServerError("Order handling failed");
    }

    ctx.send({ received: true });
  },
};


