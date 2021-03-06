var querystring = require('querystring'),
    crypto = require('crypto'),
    config = require('./config'),
    request = require('./request'),
    timeOffset = 1000 * 60 * 10,
    paramError = new Error('缺少参数');

/**
 * 初始化
 * @param {Object} options
 * @constructor
 *
 * options 可选值：
 * appKey {string} 应用的appKey
 * appSecret {string} 应用的appSecret
 * callbackUrl {string} 用于开放应用，应用管理后台设置的回调地址
 * redirectUrl {string} 用于开放应用，可选，自定义回调地址，默认同 callbackUrl
 * scope {Array} 用于开放应用，可选，权限范围，默认为 ['read_basic']
 * private {boolean} 可选，是否为私有应用，默认为 false
 */
var Auth = function (options) {
    if (arguments.length < 1 || !options.appKey || !options.appSecret) {
        throw paramError;
    }
    if (!options.private) {
        if (!options.callbackUrl) {
            throw paramError;
        }
        options.scope || (options.scope = ['read_basic']);
    }
    this.options = options;
};

Auth.prototype = {
    /**
     * 验证 Hmac
     * @param {Object} queryObj 回调地址的参数对象
     * @return {boolean}
     */
    verifyHmac: function (queryObj) {
        if (arguments.length < 1) {
            throw paramError;
        }
        var hmac = queryObj.hmac;
        delete queryObj.hmac;
        return (Date.now() - new Date(queryObj.time_stamp).getTime() < timeOffset) &&
            (hmac == crypto.createHmac('sha256', this.options.appSecret)
                .update(decodeURIComponent(querystring.stringify(queryObj)))
                .digest('hex'));
    },
    /**
     * 获取应用授权页面地址，用于开放应用
     * @param {string} shopKey
     * @param {string} state
     * @return {string}
     */
    getAuthorizeUrl: function (shopKey, state) {
        if (arguments.length < 1) {
            throw paramError;
        }
        return config.httpProtocol + '://' + config.appHost + '/oauth2/authorize?' + querystring.stringify({
                response_type: 'code',
                client_id: this.options.appKey,
                shop_key: shopKey,
                scope: this.options.scope.join(','),
                state: state,
                redirect_uri: this.options.redirectUrl
            }, null, null, {encodeURIComponent: null});
    },
    /**
     * 获取 token
     * @param {string} code，用于开放应用
     * @param {Function} callback(err, token)
     */
    getToken: function (code, callback) {
        var params,
            headers = {'Content-Type': 'application/x-www-form-urlencoded'};
        if (this.options.private) {
            if (arguments.length < 1) {
                throw paramError;
            }
            callback = arguments[0];
            headers.Authorization = 'Basic ' + new Buffer(this.options.appKey + ':' + this.options.appSecret).toString('base64');
            params = {
                grant_type: 'client_credentials'
            };
        } else {
            if (arguments.length < 2) {
                throw paramError;
            }
            params = {
                grant_type: 'authorization_code',
                code: code,
                client_id: this.options.appKey,
                redirect_uri: this.options.redirectUrl ? this.options.redirectUrl : this.options.callbackUrl
            };
        }
        request({
            hostname: config.appHost,
            path: '/oauth2/token',
            method: 'POST',
            headers: headers
        }, params, function (err, data) {
            if (err) {
               return callback(err);
            }

            if(data.error) {
               return callback(data.error);
            }

            if (!data.token.length) {
                return callback('无效的 token');
            }
            callback(null, data.token);
        });
    },
    customerData: function (secret_key, customer_data) {
        var customer_str = JSON.stringify(customer_data);
        var cipher = crypto.createCipher('aes-256-cbc', secret_key);
        var crypted = cipher.update(customer_str, 'utf8', 'hex');
        return cipher.final('hex');
    }
};


module.exports = Auth;
