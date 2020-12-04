'use strict';

const _ = require('lodash');
const {
  validateUserCreationInput,
  validateUserUpdateInput,
  validateUsersDeleteInput,
} = require('../validation/user');

module.exports = {
  async create(ctx) {
    const { body } = ctx.request;

    try {
      await validateUserCreationInput(body);
    } catch (err) {
      return ctx.badRequest('ValidationError', err);
    }

    const attributes = _.pick(body, ['firstname', 'lastname', 'email', 'roles', 'countries']);

    const userAlreadyExists = await strapi.admin.services.user.exists({
      email: attributes.email,
    });

    if (userAlreadyExists) {
      return ctx.badRequest('Email already taken');
    }

    const createdUser = await strapi.admin.services.user.create({ ...attributes, countries: attributes.roles.includes(1) ? [] : attributes.countries });

    const userInfo = strapi.admin.services.user.sanitizeUser(createdUser);

    // Send 201 created
    ctx.created({ data: userInfo });
  },

  async find(ctx) {
    const method = _.has(ctx.query, '_q') ? 'searchPage' : 'findPage';

    const { results, pagination } = await strapi.admin.services.user[method](ctx.query);

    ctx.body = {
      data: {
        results: results.map(strapi.admin.services.user.sanitizeUser),
        pagination,
      },
    };
  },
  async sendRegistrationLink(ctx) {
    const input = ctx.request.body;

    const user = await strapi.query('user', 'admin').findOne({ email: input.email });
    const url = input.link + user.registrationToken
    if (!user) {
      return;
    }
    return strapi.plugins.email.services.email
      .sendTemplatedEmail(
        {
          to: user.email,
          from: strapi.config.get('server.admin.registerAdmin.from'),
          replyTo: strapi.config.get('server.admin.registerAdmin.replyTo'),
        },
        strapi.config.get('server.admin.registerAdmin.emailTemplate'),
        {
          url,
          user: _.pick(user, ['email', 'firstname', 'lastname', 'username']),
        }
      ).then(success => ctx.send({ 'message': "success" }, 200))
      .catch(err => {
        // log error server side but do not disclose it to the user to avoid leaking informations
        strapi.log.error(err);
      });
  },

  async findOne(ctx) {
    const { id } = ctx.params;

    const user = await strapi.admin.services.user.findOne({ id });


    if (!user) {
      return ctx.notFound('User does not exist');
    }

    ctx.body = {
      data: { ...strapi.admin.services.user.sanitizeUser(user), countries: user.countries },
    };
  },

  async update(ctx) {
    const { id } = ctx.params;
    let { body: input } = ctx.request;
    input.countries = input.roles.includes(1) ? [] : input.countries

    try {
      await validateUserUpdateInput(input);
    } catch (err) {
      return ctx.badRequest('ValidationError', err);
    }

    if (_.has(input, 'email')) {
      const uniqueEmailCheck = await strapi.admin.services.user.exists({
        id_ne: id,
        email: input.email,
      });

      if (uniqueEmailCheck) {
        return ctx.badRequest('A user with this email address already exists');
      }
    }

    const updatedUser = await strapi.admin.services.user.updateById(id, input);

    if (!updatedUser) {
      return ctx.notFound('User does not exist');
    }

    ctx.body = {
      data: { ...strapi.admin.services.user.sanitizeUser(updatedUser), countries: updatedUser.countries },
    };
  },

  async deleteOne(ctx) {
    const { id } = ctx.params;

    const deletedUser = await strapi.admin.services.user.deleteById(id);

    if (!deletedUser) {
      return ctx.notFound('User not found');
    }

    return ctx.deleted({
      data: strapi.admin.services.user.sanitizeUser(deletedUser),
    });
  },

  /**
   * Delete several users
   * @param {KoaContext} ctx - koa context
   */
  async deleteMany(ctx) {
    const { body } = ctx.request;
    try {
      await validateUsersDeleteInput(body);
    } catch (err) {
      return ctx.badRequest('ValidationError', err);
    }

    const users = await strapi.admin.services.user.deleteByIds(body.ids);
    const sanitizedUsers = users.map(strapi.admin.services.user.sanitizeUser);

    return ctx.deleted({
      data: sanitizedUsers,
    });
  },
};
