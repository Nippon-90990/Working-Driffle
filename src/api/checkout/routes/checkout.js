module.exports = {
    routes: [
        {
            method: "POST",
            path: "/checkout/session",
            handler: "checkout.create",
            config: { auth: false }, // public for now
        },
    ],
};
