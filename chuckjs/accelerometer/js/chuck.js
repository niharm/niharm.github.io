/**
 * @license almond 0.2.9 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("almond", function(){});

(function() {
  define('chuck/helpers', [], function() {
    var module;
    module = {};
    module.count = function(string, substr) {
      var num, pos;
      num = pos = 0;
      if (!substr.length) {
        return 1 / 0;
      }
      while (pos = 1 + string.indexOf(substr, pos)) {
        num++;
      }
      return num;
    };
    module.last = function(array, back) {
      return array[array.length - (back || 0) - 1];
    };
    module.throwSyntaxError = function(message, location) {
      var error;
      error = new SyntaxError(message);
      error.location = location;
      error.toString = syntaxErrorToString;
      error.stack = error.toString();
      throw error;
    };
    return module;
  });

}).call(this);

(function() {
  define("chuck/logging", [], function() {
    var logger, methods, module, name, _i, _len;
    logger = void 0;
    module = {};
    methods = ['error', 'warn', 'info', 'debug', 'trace'];
    for (_i = 0, _len = methods.length; _i < _len; _i++) {
      name = methods[_i];
      module[name] = function() {
        return void 0;
      };
    }
    module.setLogger = function(logger) {
      var _j, _len1, _results;
      _results = [];
      for (_j = 0, _len1 = methods.length; _j < _len1; _j++) {
        name = methods[_j];
        if (!_.isFunction(logger[name])) {
          throw new Error("Logger lacks method " + name);
        }
        _results.push(module[name] = _.bind(logger[name], logger));
      }
      return _results;
    };
    return module;
  });

}).call(this);

(function() {
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = {}.hasOwnProperty,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  define("chuck/lexer", ["chuck/helpers", "chuck/logging"], function(helpers, logging) {
    var ALIAS_MAP, BOM, COMMENT, FLOAT, IDENTIFIER, KEYWORDS, Lexer, MATCHERS, NUMBER, TRAILING_SPACES, WHITESPACE, count, last, throwSyntaxError;
    count = helpers.count, last = helpers.last, throwSyntaxError = helpers.throwSyntaxError;
    Lexer = (function() {
      function Lexer() {
        this._matchToken = __bind(this._matchToken, this);
      }

      Lexer.prototype.tokenize = function(code) {
        var consumed, i, k, tag, v, _ref;
        this.ends = [];
        this.tokens = [];
        this.chunkLine = 0;
        this.chunkColumn = 0;
        code = this.clean(code);
        this._matchers = [];
        for (k in MATCHERS) {
          if (!__hasProp.call(MATCHERS, k)) continue;
          v = MATCHERS[k];
          this._matchers.push([new RegExp("^" + k), v]);
        }
        i = 0;
        while (this.chunk = code.slice(i)) {
          consumed = this.identifierToken() || this.floatToken() || this.intToken() || this.commentToken() || this._matchToken() || this.whitespaceToken() || this.stringToken() || this.literalToken();
          _ref = this.getLineAndColumnFromChunk(consumed), this.chunkLine = _ref[0], this.chunkColumn = _ref[1];
          i += consumed;
        }
        if (tag = this.ends.pop()) {
          this.error("missing " + tag);
        }
        return this.tokens;
      };

      Lexer.prototype.clean = function(code) {
        if (code.charCodeAt(0) === BOM) {
          code = code.slice(1);
        }
        code = code.replace(/\r/g, '').replace(TRAILING_SPACES, '');
        if (WHITESPACE.test(code)) {
          code = "\n" + code;
          --this.chunkLine;
        }
        return code;
      };

      Lexer.prototype.identifierToken = function() {
        var id, idLength, match, poppedToken, tag, tagToken, _ref;
        if (!(match = IDENTIFIER.exec(this.chunk))) {
          return 0;
        }
        id = match[0];
        idLength = id.length;
        tag = 'ID';
        if (id in ALIAS_MAP) {
          id = ALIAS_MAP[id];
        }
        if (__indexOf.call(KEYWORDS, id) >= 0) {
          tag = id.toUpperCase();
          logging.debug("Token is a keyword: '" + id + "'");
        } else {
          logging.debug("Token is an identifier: '" + id + "'");
        }
        poppedToken = void 0;
        tagToken = this.token(tag, id, 0, idLength);
        if (poppedToken) {
          _ref = [poppedToken[2].first_line, poppedToken[2].first_column], tagToken[2].first_line = _ref[0], tagToken[2].first_column = _ref[1];
        }
        logging.debug("Consumed ID of length " + idLength);
        return idLength;
      };

      Lexer.prototype.intToken = function() {
        var binaryLiteral, lexedLength, match, number, octalLiteral;
        if (!(match = NUMBER.exec(this.chunk))) {
          return 0;
        }
        number = match[0];
        logging.debug("Token is an integer: " + number);
        if (/^0[BOX]/.test(number)) {
          this.error("radix prefix '" + number + "' must be lowercase");
        } else if (/^0\d*[89]/.test(number)) {
          this.error("decimal literal '" + number + "' must not be prefixed with '0'");
        } else if (/^0\d+/.test(number)) {
          this.error("octal literal '" + number + "' must be prefixed with '0o'");
        }
        lexedLength = number.length;
        if (octalLiteral = /^0o([0-7]+)/.exec(number)) {
          number = '0x' + parseInt(octalLiteral[1], 8).toString(16);
        }
        if (binaryLiteral = /^0b([01]+)/.exec(number)) {
          number = '0x' + parseInt(binaryLiteral[1], 2).toString(16);
        }
        this.token('NUMBER', number, 0, lexedLength);
        return lexedLength;
      };

      Lexer.prototype.floatToken = function() {
        var lexedLength, match, number;
        if (!(match = FLOAT.exec(this.chunk))) {
          return 0;
        }
        number = match[0];
        logging.debug("Token is a float: " + number);
        if (/E/.test(number) && !/^0x/.test(number)) {
          this.error("exponential notation '" + number + "' must be indicated with a lowercase 'e'");
        }
        lexedLength = number.length;
        this.token('FLOAT', number, 0, lexedLength);
        return lexedLength;
      };

      Lexer.prototype.stringToken = function() {
        var match, string;
        if (!(match = /^"(.+?)"/.exec(this.chunk))) {
          return 0;
        }
        string = match[1];
        logging.debug("Token is a string: '" + string + "', " + string.length);
        this.token('STRING_LIT', string);
        return match[0].length;
      };

      Lexer.prototype.commentToken = function() {
        var comment, match;
        if (!(match = this.chunk.match(COMMENT))) {
          return 0;
        }
        comment = match[0];
        logging.debug("Token is a comment", comment);
        return comment.length;
      };

      Lexer.prototype.whitespaceToken = function() {
        var match, nline, prev;
        if (!((match = WHITESPACE.exec(this.chunk)) || (nline = this.chunk.charAt(0) === '\n'))) {
          return 0;
        }
        if (match != null) {
          logging.debug("Consuming whitespace of length " + match[0].length);
        }
        prev = last(this.tokens);
        if (prev) {
          prev[match ? 'spaced' : 'newLine'] = true;
        }
        if (match) {
          return match[0].length;
        } else {
          return 0;
        }
      };

      Lexer.prototype.literalToken = function() {
        var match, tag, value;
        if (match = /^;/.exec(this.chunk)) {
          value = match[0];
          tag = 'SEMICOLON';
          logging.debug('Token is a semicolon');
        } else {
          value = this.chunk;
          logging.debug("Unmatched token: '" + value + "'");
        }
        this.token(tag, value);
        return value.length;
      };

      Lexer.prototype._matchToken = function() {
        var match, matcher, re, token, value, _i, _len, _ref;
        _ref = this._matchers;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          matcher = _ref[_i];
          re = matcher[0], token = matcher[1];
          match = re.exec(this.chunk);
          if (match == null) {
            continue;
          }
          value = match[0];
          logging.debug("Matched text '" + value + "' against token " + token);
          this.token(token, value);
          return value.length;
        }
        return 0;
      };

      Lexer.prototype.getLineAndColumnFromChunk = function(offset) {
        var column, lineCount, lines, string;
        if (offset === 0) {
          return [this.chunkLine, this.chunkColumn];
        }
        if (offset >= this.chunk.length) {
          string = this.chunk;
        } else {
          string = this.chunk.slice(0, offset);
        }
        lineCount = count(string, '\n');
        column = this.chunkColumn;
        if (lineCount > 0) {
          lines = string.split('\n');
          column = last(lines).length;
        } else {
          column += string.length;
        }
        return [this.chunkLine + lineCount, column];
      };

      Lexer.prototype.makeToken = function(tag, value, offsetInChunk, length) {
        var lastCharacter, locationData, token, _ref, _ref1;
        if (offsetInChunk == null) {
          offsetInChunk = 0;
        }
        if (length == null) {
          length = value.length;
        }
        locationData = {};
        _ref = this.getLineAndColumnFromChunk(offsetInChunk), locationData.first_line = _ref[0], locationData.first_column = _ref[1];
        lastCharacter = Math.max(0, length - 1);
        _ref1 = this.getLineAndColumnFromChunk(offsetInChunk + lastCharacter), locationData.last_line = _ref1[0], locationData.last_column = _ref1[1];
        token = [tag, value, locationData];
        return token;
      };

      Lexer.prototype.token = function(tag, value, offsetInChunk, length) {
        var token;
        token = this.makeToken(tag, value, offsetInChunk, length);
        this.tokens.push(token);
        logging.debug("Pushed token '" + token[0] + "'");
        return token;
      };

      Lexer.prototype.error = function(message, offset) {
        var first_column, first_line, _ref;
        if (offset == null) {
          offset = 0;
        }
        _ref = this.getLineAndColumnFromChunk(offset), first_line = _ref[0], first_column = _ref[1];
        return throwSyntaxError(message, {
          first_line: first_line,
          first_column: first_column
        });
      };

      return Lexer;

    })();
    BOM = 65279;
    IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
    NUMBER = /^0[xX][0-9a-fA-F]+|^0[cC][0-7]+|^[0-9]+/i;
    FLOAT = /^(?:\d+\.\d*)|^(?:\d*\.\d+)/i;
    WHITESPACE = /^\s+/;
    COMMENT = /^(?:\s*\/\/.*)+/;
    TRAILING_SPACES = /\s+$/;
    MATCHERS = {
      '\\+\\+': 'PLUSPLUS',
      '\\-\\-': 'MINUSMINUS',
      ',': 'COMMA',
      '=>': 'CHUCK',
      '=<': 'UNCHUCK',
      '@=>': 'AT_CHUCK',
      '\\+=>': 'PLUS_CHUCK',
      '-=>': 'MINUS_CHUCK',
      '::': 'COLONCOLON',
      '<<<': 'L_HACK',
      '>>>': 'R_HACK',
      '\\(': 'LPAREN',
      '\\)': 'RPAREN',
      '\\{': 'LBRACE',
      '\\}': 'RBRACE',
      '\\.': 'DOT',
      '\\+': 'PLUS',
      '-': 'MINUS',
      '\\*': 'TIMES',
      '\\/': 'DIVIDE',
      '<=': 'LE',
      '>=': 'GE',
      '>': 'GT',
      '<': 'LT',
      '\\[': 'LBRACK',
      '\\]': 'RBRACK'
    };
    KEYWORDS = ['function', 'while', 'for', 'break', 'if', 'else'];
    ALIAS_MAP = {
      'fun': 'function'
    };
    return {
      tokenize: function(sourceCode) {
        return new Lexer().tokenize(sourceCode);
      }
    };
  });

}).call(this);

(function() {
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  define("chuck/audioContextService", ["chuck/logging"], function(logging) {
    var AudioContextService, service;
    AudioContextService = (function() {
      function AudioContextService() {
        this.stopOperation = __bind(this.stopOperation, this);
        this.createScriptProcessor = __bind(this.createScriptProcessor, this);
        this.prepareForExecution = __bind(this.prepareForExecution, this);
        this.createGainNode = __bind(this.createGainNode, this);
        this.createOscillator = __bind(this.createOscillator, this);
      }

      AudioContextService.prototype.createOscillator = function() {
        return this._audioContext.createOscillator();
      };

      AudioContextService.prototype.createGainNode = function() {
        return this._audioContext.createGainNode();
      };

      AudioContextService.prototype.getSampleRate = function() {
        return this._audioContext.sampleRate;
      };

      AudioContextService.prototype.getCurrentTime = function() {
        return this._audioContext.currentTime * this._audioContext.sampleRate;
      };

      AudioContextService.prototype.prepareForExecution = function(ac, dn) {
        var AudioContext;
        if (ac == null) {
          ac = null;
        }
        if (dn == null) {
          dn = null;
        }
        if (ac != null) {
          this._audioContext = ac;
          if (dn != null) {
            this._audioDestination = dn;
          } else {
            this._audioDestination = this._audioContext.destination;
          }
        }
        if (this._audioContext != null) {
          logging.debug("Re-using AudioContext");
          return;
        }
        logging.debug("Initializing audio context");
        AudioContext = window.AudioContext || window.webkitAudioContext;
        this._audioContext = new AudioContext();
        this._audioDestination = this._audioContext.destination;
      };

      AudioContextService.prototype.createScriptProcessor = function() {
        this._scriptProcessor = this._audioContext.createScriptProcessor(4096, 0, 2);
        this._scriptProcessor.connect(this._audioDestination);
        return this._scriptProcessor;
      };

      AudioContextService.prototype.stopOperation = function() {
        var deferred;
        if (this._scriptProcessor != null) {
          this._scriptProcessor.disconnect(0);
        }
        deferred = Q.defer();
        deferred.resolve();
        return deferred.promise;
      };

      return AudioContextService;

    })();
    service = new AudioContextService();
    return service;
  });

}).call(this);

(function() {
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = {}.hasOwnProperty;

  define("chuck/namespace", ["chuck/logging"], function(logging) {
    var ChuckValue, Namespace, Scope, module;
    module = {};
    module.Namespace = Namespace = (function() {
      function Namespace(name, parent) {
        this.name = name;
        this._scope = new Scope();
        this._types = new Scope();
        this._parent = parent;
      }

      Namespace.prototype.addType = function(type) {
        this._types.addType(type);
      };

      Namespace.prototype.findType = function(name) {
        var type;
        type = this._types.findType(name);
        if (type != null) {
          return type;
        }
        if (this._parent) {
          return this._parent.findType(name);
        } else {
          return void 0;
        }
      };

      Namespace.prototype.findValue = function(name, climb) {
        var val;
        if (climb == null) {
          climb = false;
        }
        val = this._scope.findValue(name, climb);
        if (val != null) {
          return val;
        }
        if (climb && (this._parent != null)) {
          return this._parent.findValue(name, climb);
        }
      };

      Namespace.prototype.addVariable = function(name, type, value, isGlobal) {
        return this._scope.addVariable(name, type, this, value, isGlobal);
      };

      Namespace.prototype.addConstant = function(name, type, value, isGlobal) {
        return this._scope.addConstant(name, type, this, value, isGlobal);
      };

      Namespace.prototype.addValue = function(value, name, isGlobal) {
        if (isGlobal == null) {
          isGlobal = true;
        }
        return this._scope.addValue(value, name, isGlobal);
      };

      Namespace.prototype.commit = function() {
        var scope, _i, _len, _ref;
        _ref = [this._scope, this._types];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          scope = _ref[_i];
          scope.commit();
        }
      };

      Namespace.prototype.enterScope = function() {
        logging.debug("Namespace entering nested scope");
        return this._scope.push();
      };

      Namespace.prototype.exitScope = function() {
        logging.debug("Namespace exiting nested scope");
        return this._scope.pop();
      };

      return Namespace;

    })();
    module.ChuckValue = ChuckValue = (function() {
      function ChuckValue(type, name, owner, isContextGlobal, value, isConstant) {
        this.type = type;
        this.name = name;
        this.owner = owner;
        this.isContextGlobal = isContextGlobal;
        this.value = value;
        this.isConstant = isConstant != null ? isConstant : false;
      }

      return ChuckValue;

    })();
    Scope = (function() {
      function Scope() {
        this.findType = __bind(this.findType, this);
        this.pop = __bind(this.pop, this);
        this.push = __bind(this.push, this);
        this._scopes = [];
        this._commitMap = {};
        this.push();
      }

      Scope.prototype.push = function() {
        return this._scopes.push({});
      };

      Scope.prototype.pop = function() {
        return this._scopes.pop();
      };

      Scope.prototype.findType = function(name) {
        var i, type;
        i = this._scopes.length - 1;
        while (i >= 0) {
          type = this._scopes[i][name];
          if (type != null) {
            return type;
          }
          --i;
        }
        return this._commitMap[name];
      };

      Scope.prototype.addVariable = function(name, type, namespace, value, isGlobal) {
        var chuckValue;
        if (isGlobal == null) {
          isGlobal = true;
        }
        chuckValue = new ChuckValue(type, name, namespace, isGlobal, value);
        logging.debug("Scope: Adding variable " + name + " to scope " + (this._scopes.length - 1));
        this.addValue(chuckValue);
        return chuckValue;
      };

      Scope.prototype.addConstant = function(name, type, namespace, value, isGlobal) {
        var chuckValue;
        if (isGlobal == null) {
          isGlobal = true;
        }
        chuckValue = new ChuckValue(type, name, namespace, isGlobal, value, true);
        logging.debug("Scope: Adding constant " + name + " to scope " + (this._scopes.length - 1));
        this.addValue(chuckValue);
        return chuckValue;
      };

      Scope.prototype.findValue = function(name, climb) {
        var i, lastScope, scope, value, _i, _ref;
        if (!climb) {
          lastScope = this._scopes[this._scopes.length - 1];
          value = lastScope[name];
          if (value != null) {
            return value;
          }
          if (lastScope === this._scopes[0]) {
            return this._commitMap[name];
          } else {
            return null;
          }
        } else {
          for (i = _i = _ref = this._scopes.length - 1; _ref <= 0 ? _i <= 0 : _i >= 0; i = _ref <= 0 ? ++_i : --_i) {
            scope = this._scopes[i];
            value = scope[name];
            if (value != null) {
              return value;
            }
          }
          return this._commitMap[name];
        }
      };

      Scope.prototype.addType = function(type) {
        return this.addValue(type);
      };

      Scope.prototype.commit = function() {
        var k, scope, v, _ref;
        scope = this._scopes[0];
        _ref = this._commitMap;
        for (k in _ref) {
          if (!__hasProp.call(_ref, k)) continue;
          v = _ref[k];
          scope[k] = v;
        }
        return this._commitMap = [];
      };

      Scope.prototype.addValue = function(value, name) {
        var lastScope;
        if (name == null) {
          name = null;
        }
        name = name != null ? name : value.name;
        lastScope = this._scopes[this._scopes.length - 1];
        if (this._scopes[0] !== lastScope) {
          return lastScope[name] = value;
        } else {
          return this._commitMap[name] = value;
        }
      };

      return Scope;

    })();
    return module;
  });

}).call(this);

(function() {
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define("chuck/types", ["chuck/audioContextService", "chuck/namespace", "chuck/logging"], function(audioContextService, namespace, logging) {
    var ChuckFunction, ChuckFunctionBase, ChuckMethod, ChuckStaticMethod, ChuckType, FuncArg, FunctionOverload, OscData, TwoPi, arrayNamespace, constructDac, constructObject, constructOsc, constructStep, module, oscNamespace, shredNamespace, stepNamespace, tickSinOsc, tickStep, types, ugenNamespace;
    module = {};
    TwoPi = Math.PI * 2;
    module.ChuckType = ChuckType = (function() {
      function ChuckType(name, parent, opts, constructorCb) {
        this._constructParent = __bind(this._constructParent, this);
        this.findValue = __bind(this.findValue, this);
        var k, memberType, v, _ref;
        opts = opts || {};
        this.name = name;
        this.parent = parent;
        this.size = opts.size;
        this._constructor = constructorCb;
        this._opts = opts;
        this._namespace = new namespace.Namespace();
        this.isRef = opts.isRef || false;
        this._constructParent(parent, this._opts);
        if (constructorCb != null) {
          constructorCb.call(this, this._opts);
        }
        opts.namespace = opts.namespace || {};
        _ref = opts.namespace;
        for (k in _ref) {
          if (!__hasProp.call(_ref, k)) continue;
          v = _ref[k];
          memberType = v instanceof ChuckFunctionBase ? types.Function : void 0;
          this._namespace.addVariable(k, memberType, v);
        }
      }

      ChuckType.prototype.isOfType = function(otherType) {
        var parent;
        if (this.name === otherType.name) {
          return true;
        }
        parent = this.parent;
        while (parent != null) {
          if (parent.isOfType(otherType)) {
            return true;
          }
          parent = parent.parent;
        }
        return false;
      };

      ChuckType.prototype.findValue = function(name) {
        var val;
        val = this._namespace.findValue(name);
        if (val != null) {
          return val;
        }
        if (this.parent != null) {
          return this.parent.findValue(name);
        }
      };

      ChuckType.prototype._constructParent = function(parent, opts) {
        if (parent == null) {
          return;
        }
        opts = _({}).extend(parent._opts).extend(opts).value();
        this._constructParent(parent.parent, opts);
        if (parent._constructor != null) {
          return parent._constructor.call(this, opts);
        }
      };

      return ChuckType;

    })();
    types = module.types = {};
    types.int = new ChuckType("int", void 0, {
      size: 8,
      preConstructor: void 0
    });
    types.float = new ChuckType("float", void 0, {
      size: 8,
      preConstructor: void 0
    });
    types.Time = new ChuckType("time", void 0, {
      size: 8,
      preConstructor: void 0
    });
    types.dur = new ChuckType("dur", void 0, {
      size: 8,
      preConstructor: void 0
    });
    types.String = new ChuckType("String", void 0, {
      size: 8,
      preConstructor: void 0,
      isRef: true
    });
    module.FuncArg = FuncArg = (function() {
      function FuncArg(name, type) {
        this.name = name;
        this.type = type;
      }

      return FuncArg;

    })();
    module.FunctionOverload = FunctionOverload = (function() {
      function FunctionOverload(args, func, isBuiltIn, name) {
        this.isBuiltIn = isBuiltIn != null ? isBuiltIn : true;
        this.name = name != null ? name : null;
        args = args != null ? args : [];
        this["arguments"] = args;
        this.func = func;
        this.stackDepth = args.length;
      }

      FunctionOverload.prototype.apply = function(obj) {
        return this.func.apply(arguments[0], arguments[1]);
      };

      return FunctionOverload;

    })();
    ChuckFunctionBase = (function() {
      function ChuckFunctionBase(name, overloads, isMember, typeName, retType) {
        var overload, _i, _len;
        if (retType == null) {
          throw new Error('retType unspecified');
        }
        this.name = name;
        this.isMember = isMember;
        this._overloads = [];
        this.retType = retType;
        this._typeName = typeName;
        for (_i = 0, _len = overloads.length; _i < _len; _i++) {
          overload = overloads[_i];
          this.addOverload(overload);
        }
      }

      ChuckFunctionBase.prototype.addOverload = function(overload) {
        if (this._typeName) {
          overload.name = "" + overload.name + "@" + this._typename;
        }
        overload.isMember = this.isMember;
        overload.retType = this.retType;
        if (this.isMember) {
          ++overload.stackDepth;
        }
        return this._overloads.push(overload);
      };

      ChuckFunctionBase.prototype.findOverload = function(args) {
        var mthd, _i, _len, _ref;
        args = args != null ? args : [];
        _ref = this._overloads;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          mthd = _ref[_i];
          if (mthd["arguments"].length !== args.length) {
            continue;
          }
          if (!_.every(mthd["arguments"], function(a, index) {
            return a.type.isOfType(args[index].type) || (a.type === types.float && args[index].type === types.int);
          })) {
            continue;
          }
          return mthd;
        }
        return null;
      };

      ChuckFunctionBase.prototype.getNumberOfOverloads = function() {
        return this._overloads.length;
      };

      return ChuckFunctionBase;

    })();
    module.ChuckMethod = ChuckMethod = (function(_super) {
      __extends(ChuckMethod, _super);

      function ChuckMethod(name, overloads, typeName, retType) {
        ChuckMethod.__super__.constructor.call(this, name, overloads, true, typeName, retType);
      }

      return ChuckMethod;

    })(ChuckFunctionBase);
    module.ChuckStaticMethod = ChuckStaticMethod = (function(_super) {
      __extends(ChuckStaticMethod, _super);

      function ChuckStaticMethod(name, overloads, typeName, retType) {
        ChuckStaticMethod.__super__.constructor.call(this, name, overloads, false, typeName, retType);
        this.isStatic = true;
      }

      return ChuckStaticMethod;

    })(ChuckFunctionBase);
    module.ChuckFunction = ChuckFunction = (function(_super) {
      __extends(ChuckFunction, _super);

      function ChuckFunction(name, overloads, retType) {
        ChuckFunction.__super__.constructor.call(this, name, overloads, false, null, retType);
      }

      return ChuckFunction;

    })(ChuckFunctionBase);
    types.Function = new ChuckType("Function", null, null);
    constructObject = function() {};
    types.Object = new ChuckType("Object", void 0, {
      preConstructor: constructObject
    }, function(opts) {
      this.hasConstructor = opts.preConstructor != null;
      this.preConstructor = opts.preConstructor;
      return this.size = opts.size;
    });
    module.Class = new ChuckType("Class", types.Object);
    ugenNamespace = {
      gain: new ChuckMethod("gain", [
        new FunctionOverload([new FuncArg("value", types.float)], function(value) {
          return this.setGain(value);
        })
      ], "UGen", types.float),
      last: new ChuckMethod("last", [
        new FunctionOverload([], function() {
          return this.current;
        })
      ], "UGen", types.float)
    };
    types.UGen = new ChuckType("UGen", types.Object, {
      size: 8,
      numIns: 1,
      numOuts: 1,
      preConstructor: null,
      namespace: ugenNamespace,
      ugenTick: void 0
    }, function(opts) {
      this.ugenNumIns = opts.numIns;
      this.ugenNumOuts = opts.numOuts;
      return this.ugenTick = opts.ugenTick;
    });
    OscData = (function() {
      function OscData() {
        this.num = 0.0;
        this.sync = 0;
        this.width = 0.5;
        this.phase = 0;
      }

      return OscData;

    })();
    oscNamespace = {
      freq: new ChuckMethod("freq", [
        new FunctionOverload([], function() {
          return this.data.freq;
        }), new FunctionOverload([new FuncArg("value", types.float)], function(value) {
          return this.setFrequency(value);
        })
      ], "Osc", types.float),
      sync: new ChuckMethod("sync", [
        new FunctionOverload([], function() {
          return this.data.sync;
        }), new FunctionOverload([new FuncArg("value", types.int)], function(value) {
          if (value < 0 || value > 2) {
            value = 0;
          }
          return this.data.sync = value;
        })
      ], "Osc", types.int)
    };
    constructOsc = function() {
      this.data = new OscData();
      this.setFrequency = function(value) {
        this.data.freq = value;
        this.data.num = (1 / audioContextService.getSampleRate()) * value;
        return value;
      };
      return this.setFrequency(220);
    };
    types.Osc = new ChuckType("Osc", types.UGen, {
      numIns: 1,
      numOuts: 1,
      preConstructor: constructOsc,
      namespace: oscNamespace
    });
    tickSinOsc = function(input) {
      var computeNum, d, freq, out;
      computeNum = function(d, freq) {
        d.num = freq / audioContextService.getSampleRate();
        if (d.num >= 1) {
          return d.num -= Math.floor(d.num);
        } else if (d.num <= -1) {
          return d.num += Math.floor(d.num);
        }
      };
      d = this.data;
      if (this.sources.length > 0) {
        if (d.sync === 0) {
          d.freq = input;
          computeNum(d, d.freq);
        } else if (d.sync === 2) {
          freq = d.freq + input;
          computeNum(d, freq);
        }
      }
      out = Math.sin(this.data.phase * TwoPi);
      d.phase += d.num;
      if (d.phase > 1) {
        d.phase -= 1;
      } else if (d.phase < 0) {
        d.phase += 1;
      }
      return out;
    };
    types.SinOsc = new ChuckType("SinOsc", types.Osc, {
      preConstructor: void 0,
      ugenTick: tickSinOsc
    });
    types.UGenStereo = new ChuckType("Ugen_Stereo", types.UGen, {
      numIns: 2,
      numOuts: 2,
      preConstructor: void 0,
      namespace: {
        "pan": new ChuckMethod("pan", [
          new FunctionOverload([new FuncArg("value", types.float)], function(value) {
            var left, right;
            if (value < -1) {
              value = -1;
            } else if (value > 1) {
              value = 1;
            }
            left = this._channels[0];
            right = this._channels[1];
            left.pan = value < 0 ? 1 : 1 - value;
            right.pan = value > 0 ? 1 : 1 + value;
            return value;
          })
        ], "Osc", types.float)
      }
    });
    constructDac = function() {
      return this._node = audioContextService.outputNode;
    };
    types.Dac = new ChuckType("Dac", types.UGenStereo, {
      preConstructor: constructDac
    });
    types.Bunghole = new ChuckType("Bunghole", types.UGen);
    types["void"] = new ChuckType("void");
    types.Pan2 = new ChuckType("Pan2", types.UGenStereo);
    module.isObj = function(type) {
      return !module.isPrimitive(type);
    };
    module.isPrimitive = function(type) {
      return type === types.dur || type === types.Time || type === types.int || type === types.float;
    };
    types.Gain = new ChuckType("Gain", types.UGen);
    stepNamespace = {
      next: new ChuckMethod("next", [
        new FunctionOverload([new FuncArg("value", types.float)], function(value) {
          return this.data.next = value;
        })
      ], "Step", types.float)
    };
    constructStep = function() {
      return this.data.next = 1;
    };
    tickStep = function() {
      return this.data.next;
    };
    types.Step = new ChuckType("Step", types.Osc, {
      namespace: stepNamespace,
      preConstructor: constructStep,
      ugenTick: tickStep
    });
    shredNamespace = {
      args: new ChuckMethod("args", [
        new FunctionOverload([], function() {
          return this.args.length;
        })
      ], "Shred", types.int),
      arg: new ChuckMethod("arg", [
        new FunctionOverload([new FuncArg("i", types.int)], function(i) {
          return this.args[i];
        })
      ], "Shred", types.String)
    };
    types.shred = new ChuckType("Shred", types.Object, {
      namespace: shredNamespace
    });
    arrayNamespace = {
      cap: new ChuckMethod("cap", [
        new FunctionOverload([], function() {
          return this.length;
        })
      ], "@array", types.int),
      size: new ChuckMethod("size", [
        new FunctionOverload([], function() {
          return this.length;
        })
      ], "@array", types.int)
    };
    types["@array"] = new ChuckType("@array", types.Object, {
      size: 1,
      namespace: arrayNamespace
    });
    module.createArrayType = function(elemType, depth) {
      var type;
      type = new ChuckType(elemType.name, types["@array"]);
      type.depth = depth;
      type.arrayType = elemType;
      type.isArray = true;
      return type;
    };
    return module;
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  define("chuck/nodes", ["chuck/types", "chuck/logging", "chuck/audioContextService"], function(typesModule, logging, audioContextService) {
    var AdditiveSubtractiveOperatorBase, Arg, ArrayExpression, AtChuckOperator, DivideOperator, ExpressionBase, ExpressionList, FunctionDefinition, GeOperator, GtLtOperatorBase, IfStatement, LeOperator, MinusChuckOperator, NodeBase, ParentNodeBase, PlusChuckOperator, PlusPlusOperatorBase, PrimaryArrayExpression, TimesDivideOperatorBase, TimesOperator, UnaryMinusOperator, module, types;
    module = {};
    types = typesModule.types;
    NodeBase = (function() {
      function NodeBase(nodeType) {
        this.nodeType = nodeType;
      }

      NodeBase.prototype.scanPass1 = function() {};

      NodeBase.prototype.scanPass2 = function() {};

      NodeBase.prototype.scanPass3 = function() {};

      NodeBase.prototype.scanPass4 = function() {};

      NodeBase.prototype.scanPass5 = function() {};

      return NodeBase;

    })();
    ParentNodeBase = (function() {
      function ParentNodeBase(child, nodeType) {
        this._child = child;
        this.nodeType = nodeType;
      }

      ParentNodeBase.prototype.scanPass1 = function(context) {
        return this._scanPass(1, context);
      };

      ParentNodeBase.prototype.scanPass2 = function(context) {
        return this._scanPass(2, context);
      };

      ParentNodeBase.prototype.scanPass3 = function(context) {
        return this._scanPass(3, context);
      };

      ParentNodeBase.prototype.scanPass4 = function(context) {
        return this._scanPass(4, context);
      };

      ParentNodeBase.prototype.scanPass5 = function(context) {
        return this._scanPass(5, context);
      };

      ParentNodeBase.prototype._scanPass = function(pass, context) {
        if (!this._child) {
          return;
        }
        if (_.isArray(this._child)) {
          return this._scanArray(this._child, pass, context);
        } else {
          return this._child["scanPass" + pass](context);
        }
      };

      ParentNodeBase.prototype._scanArray = function(array, pass, context) {
        var c, _i, _len;
        for (_i = 0, _len = array.length; _i < _len; _i++) {
          c = array[_i];
          if (_.isArray(c)) {
            this._scanArray(c, pass, context);
          } else {
            c["scanPass" + pass](context);
          }
        }
      };

      return ParentNodeBase;

    })();
    module.Program = (function(_super) {
      __extends(_Class, _super);

      function _Class(child) {
        _Class.__super__.constructor.call(this, child, "Program");
      }

      return _Class;

    })(ParentNodeBase);
    module.ExpressionStatement = (function(_super) {
      __extends(_Class, _super);

      function _Class(exp) {
        _Class.__super__.constructor.call(this, exp, "ExpressionStatement");
      }

      _Class.prototype.scanPass5 = function(context, opts) {
        opts = opts || {};
        this._child.scanPass5(context);
        this.ri = this._child.ri;
      };

      return _Class;

    })(ParentNodeBase);
    module.BinaryExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(exp1, operator, exp2) {
        _Class.__super__.constructor.call(this, "BinaryExpression");
        this.exp1 = exp1;
        this.operator = operator;
        this.exp2 = exp2;
      }

      _Class.prototype.scanPass2 = function(context) {
        this.exp1.scanPass2(context);
        this.exp2.scanPass2(context);
      };

      _Class.prototype.scanPass3 = function(context) {
        this.exp1.scanPass3(context);
        this.exp2.scanPass3(context);
      };

      _Class.prototype.scanPass4 = function(context) {
        this.exp1.scanPass4(context);
        logging.debug("BinaryExpression " + this.operator.name + ": Type checked LHS, type " + this.exp1.type.name);
        this.exp2.scanPass4(context);
        logging.debug("BinaryExpression " + this.operator.name + ": Type checked RHS, type " + this.exp2.type.name);
        this.type = this.operator.check(this.exp1, this.exp2, context);
        logging.debug("BinaryExpression " + this.operator.name + ": Type checked operator, type " + this.type.name);
      };

      _Class.prototype.scanPass5 = function(context) {
        logging.debug("Binary expression " + this.operator.name + ": Emitting LHS");
        this.exp1.scanPass5(context);
        logging.debug("Binary expression " + this.operator.name + ": Emitting RHS");
        this.exp2.scanPass5(context);
        logging.debug("Binary expression " + this.operator.name + ": Emitting operator");
        this.operator.emit(context, this.exp1, this.exp2);
        this.ri = this.operator.ri;
      };

      return _Class;

    })(NodeBase);
    ExpressionBase = (function(_super) {
      __extends(ExpressionBase, _super);

      function ExpressionBase(nodeType, meta) {
        if (meta == null) {
          meta = "value";
        }
        ExpressionBase.__super__.constructor.call(this, nodeType);
        this._meta = meta;
      }

      return ExpressionBase;

    })(NodeBase);
    module.ExpressionList = ExpressionList = (function(_super) {
      __extends(ExpressionList, _super);

      function ExpressionList(expression) {
        ExpressionList.__super__.constructor.call(this, "ExpressionList");
        this.expressions = [expression];
      }

      ExpressionList.prototype.prepend = function(expression) {
        this.expressions.splice(0, 0, expression);
        return this;
      };

      ExpressionList.prototype._scanPass = function(pass) {
        var exp, _i, _len, _ref;
        _ref = this.expressions;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          exp = _ref[_i];
          exp["scanPass" + pass].apply(exp, Array.prototype.slice.call(arguments, 1));
        }
      };

      ExpressionList.prototype.scanPass1 = _.partial(ExpressionList.prototype._scanPass, 1);

      ExpressionList.prototype.scanPass2 = _.partial(ExpressionList.prototype._scanPass, 2);

      ExpressionList.prototype.scanPass3 = _.partial(ExpressionList.prototype._scanPass, 3);

      ExpressionList.prototype.scanPass4 = function(context) {
        var exp;
        this._scanPass(4, context);
        this.types = (function() {
          var _i, _len, _ref, _results;
          _ref = this.expressions;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            exp = _ref[_i];
            _results.push(exp.type);
          }
          return _results;
        }).call(this);
        return this.type = this.types[0];
      };

      ExpressionList.prototype.scanPass5 = function(context) {
        this._scanPass(5, context);
        return this.ri = this.expressions[0].ri;
      };

      ExpressionList.prototype.getCount = function() {
        return this.expressions.length;
      };

      return ExpressionList;

    })(ExpressionBase);
    module.DeclarationExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(typeDecl, varDecls) {
        _Class.__super__.constructor.call(this, "DeclarationExpression");
        this.typeDecl = typeDecl;
        this.varDecls = varDecls;
      }

      _Class.prototype.scanPass2 = function(context) {
        var varDecl, _i, _len, _ref;
        this.type = context.findType(this.typeDecl.type);
        logging.debug("Variable declaration of type " + this.type.name);
        _ref = this.varDecls;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          varDecl = _ref[_i];
          if (varDecl.array != null) {
            varDecl.array.scanPass2(context);
          }
        }
      };

      _Class.prototype.scanPass3 = function(context) {
        var varDecl, _i, _len, _ref;
        _ref = this.varDecls;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          varDecl = _ref[_i];
          logging.debug("Adding variable '" + varDecl.name + "' of type " + this.type.name + " to current namespace");
          if (varDecl.array != null) {
            varDecl.array.scanPass3(context);
            this.type = typesModule.createArrayType(this.type, varDecl.array.getCount());
            logging.debug("Variable is an array, giving it array type", this.type);
          }
          varDecl.value = context.addVariable(varDecl.name, this.type);
        }
      };

      _Class.prototype.scanPass4 = function(context) {
        var varDecl, _i, _len, _ref;
        _Class.__super__.scanPass4.call(this);
        _ref = this.varDecls;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          varDecl = _ref[_i];
          logging.debug("" + this.nodeType + " Checking variable " + varDecl.name);
          if (varDecl.array != null) {
            varDecl.array.scanPass4(context);
          }
          varDecl.value.isDeclChecked = true;
          context.addValue(varDecl.value);
        }
      };

      _Class.prototype.scanPass5 = function(context) {
        var varDecl, _i, _len, _ref;
        _Class.__super__.scanPass5.call(this);
        _ref = this.varDecls;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          varDecl = _ref[_i];
          if (varDecl.array != null) {
            if (varDecl.array.exp == null) {
              logging.debug("" + this.nodeType + ": Empty array, only allocating object", varDecl);
              this.ri = context.allocateLocal(this.type, varDecl.value).ri;
              return;
            }
            logging.debug("" + this.nodeType + ": Instantiating array", varDecl);
          } else {
            logging.debug("" + this.nodeType + ": Emitting Assignment for value:", varDecl.value);
          }
        }
        this.ri = context.emitAssignment(this.type, varDecl);
      };

      return _Class;

    })(ExpressionBase);
    module.TypeDeclaration = (function(_super) {
      __extends(_Class, _super);

      function _Class(type) {
        _Class.__super__.constructor.call(this, "TypeDeclaration");
        this.type = type;
      }

      return _Class;

    })(NodeBase);
    module.VariableDeclaration = (function(_super) {
      __extends(_Class, _super);

      function _Class(name, array) {
        _Class.__super__.constructor.call(this, "VariableDeclaration");
        this.name = name;
        this.array = array;
      }

      return _Class;

    })(NodeBase);
    module.PrimaryVariableExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(name) {
        _Class.__super__.constructor.call(this, "PrimaryVariableExpression", "variable");
        this.name = name;
        this._emitVar = false;
      }

      _Class.prototype.scanPass4 = function(context) {
        _Class.__super__.scanPass4.call(this);
        switch (this.name) {
          case "second":
            this.type = types.dur;
            break;
          case "ms":
            this.type = types.dur;
            break;
          case "samp":
            this.type = types.dur;
            break;
          case "hour":
            this.type = types.dur;
            break;
          case "true":
            this._meta = "value";
            return this.type = types.int;
          case "false":
            this._meta = "value";
            return this.type = types.int;
          default:
            this.value = context.findValue(this.name);
            if (this.value == null) {
              this.value = context.findValue(this.name, true);
            }
            this.type = this.value.type;
            logging.debug("Primary variable of type " + this.type.name);
            return this.type;
        }
      };

      _Class.prototype.scanPass5 = function(context) {
        var r1, r2;
        _Class.__super__.scanPass5.call(this);
        switch (this.name) {
          case "second":
            this.ri = context.emitLoadConst(audioContextService.getSampleRate());
            break;
          case "ms":
            this.ri = context.emitLoadConst(audioContextService.getSampleRate() / 1000);
            break;
          case "samp":
            this.ri = context.emitLoadConst(1);
            break;
          case "hour":
            this.ri = context.emitLoadConst(audioContextService.getSampleRate() * 60 * 60);
            break;
          case "true":
            this.ri = context.emitLoadConst(1);
            break;
          case "false":
            this.ri = context.emitLoadConst(0);
            break;
          default:
            if (!this.value.isContextGlobal || !context.isInFunction()) {
              this.ri = this.value.ri;
            } else {
              r1 = this.value.ri;
              this.ri = r2 = context.allocRegister();
              context.emitLoadGlobal(r1, r2);
            }
            logging.debug("" + this.nodeType + ": Variable at register " + this.ri + ": " + this.value.name);
        }
      };

      return _Class;

    })(ExpressionBase);
    module.PrimaryIntExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(value) {
        this.scanPass4 = __bind(this.scanPass4, this);
        _Class.__super__.constructor.call(this, "PrimaryIntExpression", "value");
        this.value = parseInt(value);
      }

      _Class.prototype.scanPass4 = function() {
        _Class.__super__.scanPass4.call(this);
        return this.type = types.int;
      };

      _Class.prototype.scanPass5 = function(context) {
        _Class.__super__.scanPass5.call(this);
        logging.debug("" + this.nodeType + ": Emitting LoadConst(" + this.value + ")");
        return this.ri = context.emitLoadConst(this.value);
      };

      return _Class;

    })(ExpressionBase);
    module.PrimaryFloatExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(value) {
        _Class.__super__.constructor.call(this, "PrimaryFloatExpression", "value");
        this.value = parseFloat(value);
      }

      _Class.prototype.scanPass4 = function() {
        _Class.__super__.scanPass4.call(this);
        return this.type = types.float;
      };

      _Class.prototype.scanPass5 = function(context) {
        _Class.__super__.scanPass5.call(this);
        logging.debug("" + this.nodeType + ": Emitting LoadConst for " + this.value);
        return this.ri = context.emitLoadConst(this.value);
      };

      return _Class;

    })(ExpressionBase);
    module.PrimaryHackExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(expression) {
        _Class.__super__.constructor.call(this, "PrimaryHackExpression", "value");
        this.expression = expression;
      }

      _Class.prototype.scanPass4 = function(context) {
        _Class.__super__.scanPass4.call(this, context);
        logging.debug("" + this.nodeType + " scanPass4: Checking child expression");
        this.expression.scanPass4(context);
      };

      _Class.prototype.scanPass5 = function(context) {
        var e, registers, t;
        _Class.__super__.scanPass5.call(this);
        logging.debug("" + this.nodeType + ": Emitting child expression");
        this.expression.scanPass5(context);
        logging.debug("" + this.nodeType + ": Emitting Gack, types:", (function() {
          var _i, _len, _ref, _results;
          _ref = this.expression.types;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            t = _ref[_i];
            _results.push(t.name);
          }
          return _results;
        }).call(this));
        registers = (function() {
          var _i, _len, _ref, _results;
          _ref = this.expression.expressions;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            e = _ref[_i];
            _results.push(e.ri);
          }
          return _results;
        }).call(this);
        context.emitGack(this.expression.types, registers);
      };

      return _Class;

    })(ExpressionBase);
    module.PrimaryStringExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(value) {
        _Class.__super__.constructor.call(this, "PrimaryStringExpression", "value");
        this.value = value;
      }

      _Class.prototype.scanPass4 = function() {
        _Class.__super__.scanPass4.call(this);
        return this.type = types.String;
      };

      _Class.prototype.scanPass5 = function(context) {
        _Class.__super__.scanPass5.call(this);
        return this.ri = context.emitLoadConst(this.value);
      };

      return _Class;

    })(ExpressionBase);
    module.ArrayExpression = ArrayExpression = (function(_super) {
      __extends(ArrayExpression, _super);

      function ArrayExpression(base, indices) {
        ArrayExpression.__super__.constructor.call(this, "ArrayExpression", "variable");
        this.base = base;
        this.indices = indices;
      }

      ArrayExpression.prototype.scanPass1 = function() {
        ArrayExpression.__super__.scanPass1.call(this);
        this.base.scanPass1();
        return this.indices.scanPass1();
      };

      ArrayExpression.prototype.scanPass2 = function() {
        ArrayExpression.__super__.scanPass2.call(this);
        this.base.scanPass2();
        return this.indices.scanPass2();
      };

      ArrayExpression.prototype.scanPass3 = function() {
        ArrayExpression.__super__.scanPass3.call(this);
        this.base.scanPass3();
        return this.indices.scanPass3();
      };

      ArrayExpression.prototype.scanPass4 = function(context) {
        var baseType;
        ArrayExpression.__super__.scanPass4.call(this, context);
        logging.debug("" + this.nodeType + " scanPass4: Base");
        baseType = this.base.scanPass4(context);
        logging.debug("" + this.nodeType + " scanPass4: Indices");
        this.indices.scanPass4(context);
        this.type = baseType.arrayType;
        logging.debug("" + this.nodeType + " scanPass4: Type determined to be " + this.type.name);
        return this.type;
      };

      ArrayExpression.prototype.scanPass5 = function(context) {
        logging.debug("" + this.nodeType + " emitting");
        ArrayExpression.__super__.scanPass5.call(this, context);
        this.base.scanPass5(context);
        this.indices.scanPass5(context);
        logging.debug("" + this.nodeType + ": Emitting ArrayAccess (as variable: " + this._emitVar + ")");
        this.ri = context.allocRegister();
        context.emitArrayAccess(this.type, this.base.ri, this.indices.ri, this.ri, this._emitVar);
      };

      return ArrayExpression;

    })(ExpressionBase);
    module.FuncCallExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(base, args) {
        _Class.__super__.constructor.call(this, "FuncCallExpression");
        this.func = base;
        this.args = args;
      }

      _Class.prototype.scanPass1 = function() {
        logging.debug("" + this.nodeType + ": scanPass1");
        _Class.__super__.scanPass1.call(this);
        this.func.scanPass1();
        if (this.args != null) {
          return this.args.scanPass1();
        }
      };

      _Class.prototype.scanPass2 = function() {
        logging.debug("" + this.nodeType + ": scanPass2");
        _Class.__super__.scanPass2.call(this);
        this.func.scanPass2();
        if (this.args != null) {
          return this.args.scanPass2();
        }
      };

      _Class.prototype.scanPass3 = function() {
        logging.debug("" + this.nodeType + ": scanPass3");
        _Class.__super__.scanPass3.call(this);
        this.func.scanPass3();
        if (this.args != null) {
          return this.args.scanPass3();
        }
      };

      _Class.prototype.scanPass4 = function(context) {
        var funcGroup;
        _Class.__super__.scanPass4.call(this, context);
        logging.debug("" + this.nodeType + " scanPass4: Checking type of @func");
        this.func.scanPass4(context);
        if (this.args != null) {
          this.args.scanPass4(context);
        }
        funcGroup = this.func.value.value;
        logging.debug("" + this.nodeType + " scanPass4: Finding function overload");
        this._ckFunc = funcGroup.findOverload(this.args != null ? this.args.expressions : null);
        this.type = funcGroup.retType;
        logging.debug("" + this.nodeType + " scanPass4: Got function overload " + this._ckFunc.name + " with return type " + this.type.name);
        return this.type;
      };

      _Class.prototype.scanPass5 = function(context) {
        var argRegisters, r1;
        logging.debug("" + this.nodeType + " scanPass5");
        _Class.__super__.scanPass5.call(this, context);
        if (this._ckFunc.isMember) {
          logging.debug("" + this.nodeType + ": Scanning method instance");
          this.func.scanPass5(context);
        }
        if (this.args != null) {
          logging.debug("" + this.nodeType + ": Scanning arguments");
          this.args.scanPass5(context);
          argRegisters = this.args.expressions.map(function(exp) {
            return exp.ri;
          });
        } else {
          argRegisters = [];
        }
        r1 = context.emitLoadConst(this._ckFunc);
        this.ri = context.allocRegister();
        if (this._ckFunc.isBuiltIn) {
          if (this._ckFunc.isMember) {
            logging.debug("" + this.nodeType + ": Emitting instance method call");
            argRegisters.unshift(context.emitLoadLocal(this.func.ri));
            return context.emitFuncCallMember(r1, argRegisters, this.ri);
          } else {
            logging.debug("" + this.nodeType + ": Emitting static method call");
            return context.emitFuncCallStatic(r1, argRegisters, this.ri);
          }
        } else {
          logging.debug("" + this.nodeType + ": Emitting function call");
          return context.emitFuncCall(r1, argRegisters, this.ri);
        }
      };

      return _Class;

    })(ExpressionBase);
    module.DurExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(base, unit) {
        _Class.__super__.constructor.call(this, "DurExpression");
        this.base = base;
        this.unit = unit;
      }

      _Class.prototype.scanPass2 = function(context) {
        _Class.__super__.scanPass2.call(this, context);
        logging.debug('DurExpression');
        this.base.scanPass2(context);
        return this.unit.scanPass2(context);
      };

      _Class.prototype.scanPass3 = function(context) {
        _Class.__super__.scanPass3.call(this, context);
        this.base.scanPass3(context);
        return this.unit.scanPass3(context);
      };

      _Class.prototype.scanPass4 = function(context) {
        _Class.__super__.scanPass4.call(this, context);
        this.type = types.dur;
        this.base.scanPass4(context);
        return this.unit.scanPass4(context);
      };

      _Class.prototype.scanPass5 = function(context) {
        _Class.__super__.scanPass5.call(this, context);
        this.base.scanPass5(context);
        this.unit.scanPass5(context);
        this.ri = context.allocRegister();
        return context.emitTimesNumber(this.base.ri, this.unit.ri, this.ri);
      };

      return _Class;

    })(ExpressionBase);
    module.UnaryExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(operator, exp) {
        this.op = operator;
        this.exp = exp;
      }

      _Class.prototype.scanPass4 = function(context) {
        if (this.exp != null) {
          this.exp.scanPass4(context);
        }
        return this.type = this.op.check(this.exp);
      };

      _Class.prototype.scanPass5 = function(context) {
        logging.debug("UnaryExpression: Emitting expression");
        this.exp.scanPass5(context);
        logging.debug("UnaryExpression: Emitting operator");
        this.ri = context.allocRegister();
        this.op.emit(context, this.exp.ri, this.ri, this.exp.value.isContextGlobal);
      };

      return _Class;

    })(ExpressionBase);
    module.UnaryMinusOperator = UnaryMinusOperator = (function() {
      function UnaryMinusOperator() {
        this.name = "UnaryMinusOperator";
      }

      UnaryMinusOperator.prototype.check = function(exp) {
        if (exp.type === types.int || exp.type === types.float) {
          return exp.type;
        }
      };

      UnaryMinusOperator.prototype.emit = function(context, r1, r2) {
        logging.debug("" + this.name + " emit");
        context.emitNegateNumber(r1, r2);
      };

      return UnaryMinusOperator;

    })();
    module.ChuckOperator = (function() {
      function _Class() {
        this.name = "ChuckOperator";
      }

      _Class.prototype.check = function(lhs, rhs, context) {
        var expressions, funcGroup;
        if (lhs.type === rhs.type) {
          if (typesModule.isPrimitive(lhs.type) || lhs.type === types.String) {
            if (rhs._meta === "variable") {
              rhs._emitVar = true;
            }
            return rhs.type;
          }
        }
        if (lhs.type === types.dur && rhs.type === types.Time && rhs.name === "now") {
          return rhs.type;
        }
        if (lhs.type.isOfType(types.UGen) && rhs.type.isOfType(types.UGen)) {
          return rhs.type;
        }
        if (rhs.type.isOfType(types.Function)) {
          rhs.scanPass4(context);
          funcGroup = rhs.value.value;
          expressions = lhs.expressions ? lhs.expressions : [lhs];
          rhs._ckFunc = funcGroup.findOverload(expressions);
          this.type = funcGroup.retType;
          logging.debug("" + this.name + " check: Got function overload " + rhs._ckFunc.name + " with return type " + this.type.name);
          return this.type;
        }
        if (lhs.type === types.int && rhs.type === types.float) {
          lhs.castTo = rhs.type;
          return types.float;
        }
      };

      _Class.prototype.emit = function(context, lhs, rhs) {
        var argRegisters, e, expressions, isArray, lType, r1, rType;
        logging.debug("" + this.name + " emit");
        lType = lhs.castTo != null ? lhs.castTo : lhs.type;
        rType = rhs.castTo != null ? rhs.castTo : rhs.type;
        if (lType.isOfType(types.UGen) && rType.isOfType(types.UGen)) {
          context.emitUGenLink(lhs.ri, rhs.ri);
          this.ri = rhs.ri;
        } else if (lType.isOfType(types.dur) && rType.isOfType(types.Time)) {
          if (rhs.name === "now") {
            context.emitTimeAdvance(lhs.ri);
          }
        } else if (rType.isOfType(types.Function)) {
          this.ri = context.allocRegister();
          if (rhs._ckFunc.isMember) {
            logging.debug("" + this.name + ": Emitting instance method " + rhs._ckFunc.name);
            r1 = context.emitDotMemberFunc(rhs._ckFunc, rhs.ri);
          } else {
            logging.debug("" + this.name + ": Emitting function " + rhs._ckFunc.name);
            r1 = context.emitLoadConst(rhs._ckFunc);
          }
          expressions = lhs.expressions ? lhs.expressions : [lhs];
          argRegisters = (function() {
            var _i, _len, _results;
            _results = [];
            for (_i = 0, _len = expressions.length; _i < _len; _i++) {
              e = expressions[_i];
              _results.push(context.emitLoadLocal(e.ri));
            }
            return _results;
          })();
          if (rhs._ckFunc.isMember) {
            argRegisters.unshift(context.emitLoadLocal(rhs.ri));
            logging.debug("" + this.name + " emitting instance method call");
            context.emitFuncCallMember(r1, argRegisters, this.ri);
          } else {
            logging.debug("" + this.name + " emitting static method call");
            context.emitFuncCallStatic(r1, argRegisters, this.ri);
          }
        } else if (lType.isOfType(rType)) {
          isArray = rhs.indices != null;
          if (!isArray) {
            logging.debug("" + this.name + " emitting OpAtChuck to assign one object to another");
          } else {
            logging.debug("" + this.name + " emitting OpAtChuck to assign an object to an array element");
          }
          context.emitOpAtChuck(lhs.ri, rhs.ri, isArray);
          this.ri = rhs.ri;
        }
      };

      return _Class;

    })();
    module.UnchuckOperator = (function() {
      function _Class() {
        this.name = "UnchuckOperator";
      }

      _Class.prototype.check = function(lhs, rhs, context) {
        if (lhs.type.isOfType(types.UGen) && rhs.type.isOfType(types.UGen)) {
          return rhs.type;
        }
      };

      _Class.prototype.emit = function(context, lhs, rhs) {
        if (lhs.type.isOfType(types.UGen) && rhs.type.isOfType(types.UGen)) {
          context.emitUGenUnlink(lhs.ri, rhs.ri);
        }
      };

      return _Class;

    })();
    module.AtChuckOperator = AtChuckOperator = (function() {
      function AtChuckOperator() {
        this.name = "AtChuckOperator";
      }

      AtChuckOperator.prototype.check = function(lhs, rhs) {
        rhs._emitVar = true;
        return rhs.type;
      };

      AtChuckOperator.prototype.emit = function(context, lhs, rhs) {
        context.emitOpAtChuck(lhs.ri, rhs.ri);
      };

      return AtChuckOperator;

    })();
    module.PlusChuckOperator = PlusChuckOperator = (function() {
      function PlusChuckOperator() {
        this.name = "PlusChuckOperator";
      }

      PlusChuckOperator.prototype.check = function(lhs, rhs) {
        if ((lhs.type === rhs.type) || (lhs.type === types.int && rhs.type === types.float)) {
          if (typesModule.isPrimitive(lhs.type) || lhs.type === types.String) {
            if (rhs._meta === "variable") {
              rhs._emitVar = true;
            }
            return rhs.type;
          }
        }
      };

      PlusChuckOperator.prototype.emit = function(context, lhs, rhs) {
        this.ri = rhs.ri;
        return context.emitPlusAssign(rhs.ri, lhs.ri, this.ri);
      };

      return PlusChuckOperator;

    })();
    module.MinusChuckOperator = MinusChuckOperator = (function() {
      function MinusChuckOperator() {
        this.name = "MinusChuckOperator";
      }

      MinusChuckOperator.prototype.check = function(lhs, rhs) {
        if (lhs.type === rhs.type) {
          if (typesModule.isPrimitive(lhs.type) || lhs.type === types.String) {
            if (rhs._meta === "variable") {
              rhs._emitVar = true;
            }
            return rhs.type;
          }
        }
      };

      MinusChuckOperator.prototype.emit = function(context, lhs, rhs) {
        this.ri = rhs.ri;
        return context.emitMinusAssign(rhs.ri, lhs.ri, this.ri);
      };

      return MinusChuckOperator;

    })();
    AdditiveSubtractiveOperatorBase = (function() {
      function AdditiveSubtractiveOperatorBase() {}

      AdditiveSubtractiveOperatorBase.prototype.check = function(lhs, rhs) {
        if (lhs.type === rhs.type) {
          return lhs.type;
        }
        if ((lhs.type === types.dur && rhs.type === types.Time) || (lhs.type === types.Time && rhs.type === types.dur)) {
          return types.Time;
        }
        if (lhs.type === types.int && rhs.type === types.int) {
          return types.int;
        }
        if ((lhs.type === types.float && rhs.type === types.float) || (lhs.type === types.int && rhs.type === types.float) || (lhs.type === types.float && rhs.type === types.int)) {
          return types.float;
        }
      };

      return AdditiveSubtractiveOperatorBase;

    })();
    module.PlusOperator = (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        this.name = "PlusOperator";
      }

      _Class.prototype.emit = function(context, lhs, rhs) {
        this.ri = context.allocRegister();
        logging.debug("PlusOperator emitting AddNumber for registers " + lhs.ri + " and " + rhs.ri + " to register " + this.ri);
        return context.emitAddNumber(lhs.ri, rhs.ri, this.ri);
      };

      return _Class;

    })(AdditiveSubtractiveOperatorBase);
    PlusPlusOperatorBase = (function() {
      function _Class(name) {
        this.name = name;
      }

      _Class.prototype.check = function(exp) {
        var type;
        exp._emitVar = true;
        type = exp.type;
        if (type === types.int || type === types.float) {
          return type;
        } else {
          return null;
        }
      };

      return _Class;

    })();
    module.PrefixPlusPlusOperator = (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        _Class.__super__.constructor.call(this, "PrefixPlusPlusOperator");
      }

      _Class.prototype.emit = function(context, r1, r2) {
        logging.debug("" + this.name + " emitting PreIncNumber");
        return context.emitPreIncNumber(r1, r2);
      };

      return _Class;

    })(PlusPlusOperatorBase);
    module.PostfixPlusPlusOperator = (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        _Class.__super__.constructor.call(this, "PostfixPlusPlusOperator");
      }

      _Class.prototype.emit = function(context, r1, r2) {
        logging.debug("" + this.name + " emitting PostIncNumber");
        return context.emitPostIncNumber(r1, r2);
      };

      return _Class;

    })(PlusPlusOperatorBase);
    module.MinusOperator = (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        this.name = "MinusOperator";
      }

      _Class.prototype.emit = function(context, lhs, rhs) {
        logging.debug("" + this.name + " emitting SubtractNumber");
        this.ri = context.allocRegister();
        context.emitSubtractNumber(lhs.ri, rhs.ri, this.ri);
      };

      return _Class;

    })(AdditiveSubtractiveOperatorBase);
    module.MinusMinusOperator = (function() {
      function _Class() {
        this.name = "MinusMinusOperator";
      }

      return _Class;

    })();
    TimesDivideOperatorBase = (function() {
      function TimesDivideOperatorBase() {}

      TimesDivideOperatorBase.prototype.check = function(lhs, rhs, context) {
        var lhsType, rhsType;
        lhsType = lhs.type;
        rhsType = rhs.type;
        if (lhs.type === types.int && rhs.type === types.float) {
          lhsType = lhs.castTo = types.float;
        } else if (lhs.type === types.float && rhs.type === types.int) {
          rhsType = rhs.castTo = types.float;
        }
        if (lhsType === types.float && rhsType === types.float) {
          return types.float;
        }
        if (lhsType === types.int && rhsType === types.int) {
          return types.int;
        }
        if (lhsType === types.float && rhsType === types.dur) {
          return types.dur;
        }
      };

      return TimesDivideOperatorBase;

    })();
    module.TimesOperator = TimesOperator = (function(_super) {
      __extends(TimesOperator, _super);

      function TimesOperator() {
        this.name = "TimesOperator";
      }

      TimesOperator.prototype.emit = function(context, lhs, rhs) {
        this.ri = context.allocRegister();
        context.emitTimesNumber(lhs.ri, rhs.ri, this.ri);
      };

      return TimesOperator;

    })(TimesDivideOperatorBase);
    module.DivideOperator = DivideOperator = (function(_super) {
      __extends(DivideOperator, _super);

      function DivideOperator() {
        this.name = "DivideOperator";
      }

      DivideOperator.prototype.check = function(lhs, rhs, context) {
        var type;
        logging.debug("" + this.name + " scanPass4");
        type = DivideOperator.__super__.check.call(this, lhs, rhs, context);
        if (type != null) {
          return type;
        }
        if ((lhs.type === types.dur && rhs.type === types.dur) || (lhs.type === types.Time && rhs.type === types.dur)) {
          logging.debug("" + this.name + " scanPass4: Deduced the type to be float");
          return types.float;
        }
      };

      DivideOperator.prototype.emit = function(context, lhs, rhs) {
        this.ri = context.allocRegister();
        context.emitDivideNumber(lhs.ri, rhs.ri, this.ri);
      };

      return DivideOperator;

    })(TimesDivideOperatorBase);
    GtLtOperatorBase = (function() {
      function GtLtOperatorBase() {}

      GtLtOperatorBase.prototype.check = function(lhs, rhs) {
        if (lhs.type === rhs.type) {
          return lhs.type;
        }
        if (lhs.type === types.Time && rhs.type === types.Time) {
          return types.int;
        }
        if ((lhs.type === types.int && rhs.type === types.float) || (lhs.type === types.float && rhs.type === types.int)) {
          return types.int;
        }
      };

      return GtLtOperatorBase;

    })();
    module.LtOperator = (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        this.name = "LtOperator";
      }

      _Class.prototype.emit = function(context, lhs, rhs) {
        logging.debug("" + this.name + ": Emitting");
        this.ri = context.allocRegister();
        return context.emitLtNumber(lhs.ri, rhs.ri, this.ri);
      };

      return _Class;

    })(GtLtOperatorBase);
    module.GtOperator = (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        this.name = "GtOperator";
      }

      _Class.prototype.emit = function(context, lhs, rhs) {
        logging.debug("" + this.name + ": Emitting");
        this.ri = context.allocRegister();
        return context.emitGtNumber(lhs.ri, rhs.ri, this.ri);
      };

      return _Class;

    })(GtLtOperatorBase);
    module.LeOperator = LeOperator = (function(_super) {
      __extends(LeOperator, _super);

      function LeOperator() {
        this.name = "LeOperator";
      }

      LeOperator.prototype.emit = function(context, lhs, rhs) {
        logging.debug("" + this.name + ": Emitting");
        this.ri = context.allocRegister();
        return context.emitLeNumber(lhs.ri, rhs.ri, this.ri);
      };

      return LeOperator;

    })(GtLtOperatorBase);
    module.GeOperator = GeOperator = (function(_super) {
      __extends(GeOperator, _super);

      function GeOperator() {
        this.name = "GeOperator";
      }

      GeOperator.prototype.emit = function(context, lhs, rhs) {
        logging.debug("" + this.name + ": Emitting");
        this.ri = context.allocRegister();
        return context.emitGeNumber(lhs.ri, rhs.ri, this.ri);
      };

      return GeOperator;

    })(GtLtOperatorBase);
    module.WhileStatement = (function(_super) {
      __extends(_Class, _super);

      function _Class(cond, body) {
        _Class.__super__.constructor.call(this, "WhileStatement");
        this.condition = cond;
        this.body = body;
      }

      _Class.prototype.scanPass1 = function() {
        this.condition.scanPass1();
        this.body.scanPass1();
      };

      _Class.prototype.scanPass2 = function(context) {
        this.condition.scanPass2(context);
        this.body.scanPass2(context);
      };

      _Class.prototype.scanPass3 = function(context) {
        this.condition.scanPass3(context);
        this.body.scanPass3(context);
      };

      _Class.prototype.scanPass4 = function(context) {
        logging.debug("WhileStatement: Type checking condition");
        this.condition.scanPass4(context);
        logging.debug("WhileStatement: Body");
        this.body.scanPass4(context);
      };

      _Class.prototype.scanPass5 = function(context) {
        var branchEq, breakJmp, r2, startIndex;
        startIndex = context.getNextIndex();
        this.condition.scanPass5(context);
        r2 = context.emitLoadConst(false);
        logging.debug("WhileStatement: Emitting BranchEq");
        branchEq = context.emitBranchEq(this.condition.ri, r2);
        this.body.scanPass5(context);
        logging.debug("WhileStatement: Emitting GoTo (instruction number " + startIndex + ")");
        context.emitGoto(startIndex);
        context.evaluateBreaks();
        breakJmp = context.getNextIndex();
        logging.debug("WhileStatement: Configuring BranchEq instruction to jump to instruction number " + breakJmp);
        branchEq.jmp = breakJmp;
      };

      return _Class;

    })(NodeBase);
    module.ForStatement = (function(_super) {
      __extends(_Class, _super);

      function _Class(c1, c2, c3, body) {
        _Class.__super__.constructor.call(this, "ForStatement");
        this.c1 = c1;
        this.c2 = c2;
        this.c3 = c3;
        this.body = body;
      }

      _Class.prototype.scanPass2 = function(context) {
        this.c1.scanPass2(context);
        this.c2.scanPass2(context);
        if (this.c3 != null) {
          this.c3.scanPass2(context);
        }
        this.body.scanPass2(context);
      };

      _Class.prototype.scanPass3 = function(context) {
        logging.debug("" + this.nodeType);
        context.enterScope();
        this.c1.scanPass3(context);
        this.c2.scanPass3(context);
        if (this.c3 != null) {
          this.c3.scanPass3(context);
        }
        this.body.scanPass3(context);
        context.exitScope();
      };

      _Class.prototype.scanPass4 = function(context) {
        logging.debug("" + this.nodeType);
        context.enterScope();
        logging.debug("" + this.nodeType + ": Checking the initial");
        this.c1.scanPass4(context);
        logging.debug("" + this.nodeType + ": Checking the condition");
        this.c2.scanPass4(context);
        if (this.c3 != null) {
          logging.debug("" + this.nodeType + ": Checking the post");
          this.c3.scanPass4(context);
        }
        logging.debug("" + this.nodeType + ": Checking the body");
        this.body.scanPass4(context);
        context.exitScope();
      };

      _Class.prototype.scanPass5 = function(context) {
        var branchEq, breakJmp, startIndex;
        context.enterCodeScope();
        logging.debug("" + this.nodeType + ": Emitting the initial");
        this.c1.scanPass5(context);
        startIndex = context.getNextIndex();
        logging.debug("" + this.nodeType + ": Emitting the condition");
        this.c2.scanPass5(context);
        branchEq = context.emitBranchEq(this.c2.ri, context.emitLoadConst(false));
        context.enterCodeScope();
        logging.debug("" + this.nodeType + ": Emitting the body");
        this.body.scanPass5(context);
        context.exitCodeScope();
        if (this.c3 != null) {
          logging.debug("" + this.nodeType + ": Emitting the post");
          this.c3.scanPass5(context);
        }
        logging.debug("ForStatement: Emitting GoTo (instruction number " + startIndex + ")");
        context.emitGoto(startIndex);
        if (this.c2 != null) {
          breakJmp = context.getNextIndex();
          logging.debug("ForStatement: Configuring BranchEq instruction to jump to instruction number " + breakJmp);
          branchEq.jmp = breakJmp;
        }
        context.evaluateBreaks();
        context.exitCodeScope();
      };

      return _Class;

    })(NodeBase);
    module.CodeStatement = (function(_super) {
      __extends(_Class, _super);

      function _Class(statementList) {
        _Class.__super__.constructor.call(this, statementList, "CodeStatement");
      }

      return _Class;

    })(ParentNodeBase);
    module.BreakStatement = (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        _Class.__super__.constructor.call(this, 'BreakStatement');
      }

      _Class.prototype.scanPass5 = function(context) {
        context.emitBreak();
      };

      return _Class;

    })(NodeBase);
    module.IfStatement = IfStatement = (function(_super) {
      __extends(IfStatement, _super);

      function IfStatement(condition, body) {
        this.condition = condition;
        this.body = body;
        IfStatement.__super__.constructor.call(this, 'IfStatement');
      }

      IfStatement.prototype.scanPass2 = function(context) {
        this.condition.scanPass2(context);
        context.enterScope();
        this.body.scanPass2(context);
        context.exitScope();
      };

      IfStatement.prototype.scanPass3 = function(context) {
        logging.debug("" + this.nodeType + ": scanPass3");
        this.condition.scanPass3(context);
        context.enterScope();
        this.body.scanPass3(context);
        context.exitScope();
      };

      IfStatement.prototype.scanPass4 = function(context) {
        logging.debug("" + this.nodeType + ": scanPass4");
        logging.debug("" + this.nodeType + ": Checking the condition");
        this.condition.scanPass4(context);
        context.enterScope();
        logging.debug("" + this.nodeType + ": Checking the body");
        this.body.scanPass4(context);
        context.exitScope();
      };

      IfStatement.prototype.scanPass5 = function(context) {
        var branchIfFalse, jmp;
        logging.debug("" + this.nodeType + ": Emitting the condition");
        this.condition.scanPass5(context);
        branchIfFalse = context.emitBranchIfFalse(this.condition.ri);
        context.enterCodeScope();
        logging.debug("" + this.nodeType + ": Emitting the body");
        this.body.scanPass5(context);
        context.exitCodeScope();
        jmp = context.getNextIndex();
        logging.debug("" + this.nodeType + ": Configuring BranchIfFalse instruction to jump to instruction number " + jmp);
        branchIfFalse.jmp = jmp;
      };

      return IfStatement;

    })(NodeBase);
    module.DotMemberExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(base, id) {
        _Class.__super__.constructor.call(this, "DotMemberExpression");
        this.base = base;
        this.id = id;
      }

      _Class.prototype.scanPass2 = function() {
        this.base.scanPass2();
      };

      _Class.prototype.scanPass3 = function() {
        this.base.scanPass3();
      };

      _Class.prototype.scanPass4 = function(context) {
        var baseType;
        logging.debug("" + this.nodeType + " scanPass4");
        this.base.scanPass4(context);
        this.isStatic = this.base.type.actualType != null;
        if (this.isStatic) {
          logging.debug("" + this.nodeType + " scanPass4: This is a static member expression");
        }
        baseType = this.isStatic ? this.base.type.actualType : this.base.type;
        logging.debug("" + this.nodeType + " scanPass4: Finding member '" + this.id + "' in base type " + baseType.name);
        this.value = baseType.findValue(this.id);
        this.type = this.value.type;
        logging.debug("" + this.nodeType + " scanPass4: Member type is " + this.type.name);
        return this.type;
      };

      _Class.prototype.scanPass5 = function(context) {
        logging.debug("" + this.nodeType + " scanPass5");
        if (!this.isStatic) {
          logging.debug("" + this.nodeType + " scanPass5: Scanning base expression");
          this.base.scanPass5(context);
          this.ri = this.base.ri;
        }
      };

      return _Class;

    })(NodeBase);
    module.PostfixExpression = (function(_super) {
      __extends(_Class, _super);

      function _Class(base, operator) {
        _Class.__super__.constructor.call(this, "PostfixExpression", "variable");
        this.exp = base;
        this.op = operator;
      }

      _Class.prototype.scanPass4 = function(context) {
        this.exp.scanPass4(context);
        return this.type = this.op.check(this.exp);
      };

      _Class.prototype.scanPass5 = function(context) {
        this.exp.scanPass5(context);
        this.ri = context.allocRegister();
        return this.op.emit(context, this.exp.ri, this.ri, this.exp.value.isContextGlobal);
      };

      return _Class;

    })(NodeBase);
    module.ArraySub = (function(_super) {
      __extends(_Class, _super);

      function _Class(exp) {
        _Class.__super__.constructor.call(this, "ArraySub");
        this.exp = exp;
      }

      _Class.prototype.scanPass1 = function(context) {
        logging.debug("" + this.nodeType + " scanPass1");
        if (this.exp != null) {
          return this.exp.scanPass1(context);
        }
      };

      _Class.prototype.scanPass2 = function(context) {
        logging.debug("" + this.nodeType + " scanPass2");
        if (this.exp != null) {
          return this.exp.scanPass2(context);
        }
      };

      _Class.prototype.scanPass3 = function(context) {
        logging.debug("" + this.nodeType + " scanPass3");
        if (this.exp != null) {
          return this.exp.scanPass3(context);
        }
      };

      _Class.prototype.scanPass4 = function(context) {
        logging.debug("" + this.nodeType + " scanPass4");
        if (this.exp != null) {
          return this.exp.scanPass4(context);
        }
      };

      _Class.prototype.scanPass5 = function(context) {
        logging.debug("" + this.nodeType + ": Emitting array indices");
        if (this.exp != null) {
          this.exp.scanPass5(context);
        }
        this.expressions = this.exp.expressions;
        return this.ri = this.exp.ri;
      };

      _Class.prototype.getCount = function() {
        if (this.exp) {
          return this.exp.getCount();
        } else {
          return 0;
        }
      };

      return _Class;

    })(NodeBase);
    module.PrimaryArrayExpression = PrimaryArrayExpression = (function(_super) {
      __extends(PrimaryArrayExpression, _super);

      function PrimaryArrayExpression(exp) {
        this.exp = exp;
        PrimaryArrayExpression.__super__.constructor.call(this, "PrimaryArrayExpression");
      }

      PrimaryArrayExpression.prototype.scanPass4 = function(context) {
        var type;
        logging.debug("" + this.nodeType + " scanPass4");
        type = this.exp.scanPass4(context);
        return this.type = new typesModule.createArrayType(type);
      };

      PrimaryArrayExpression.prototype.scanPass5 = function(context) {
        var e, registers;
        logging.debug("" + this.nodeType + " scanPass5");
        this.exp.scanPass5(context);
        registers = (function() {
          var _i, _len, _ref, _results;
          _ref = this.exp.expressions;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            e = _ref[_i];
            _results.push(e.ri);
          }
          return _results;
        }).call(this);
        this.ri = context.allocRegister();
        return context.emitArrayInit(this.exp.type, registers, this.ri);
      };

      return PrimaryArrayExpression;

    })(NodeBase);
    module.FunctionDefinition = FunctionDefinition = (function(_super) {
      __extends(FunctionDefinition, _super);

      function FunctionDefinition(funcDecl, staticDecl, typeDecl, name, args, code) {
        this.funcDecl = funcDecl;
        this.staticDecl = staticDecl;
        this.typeDecl = typeDecl;
        this.name = name;
        this.args = args;
        this.code = code;
        FunctionDefinition.__super__.constructor.call(this, "FunctionDefinition");
      }

      FunctionDefinition.prototype.scanPass2 = function(context) {
        var arg, i, _i, _len, _ref;
        logging.debug("" + this.nodeType + " scanPass2");
        this.retType = context.findType(this.typeDecl.type);
        logging.debug("" + this.nodeType + " scanPass3: Return type determined as " + this.retType.name);
        _ref = this.args;
        for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
          arg = _ref[i];
          arg.type = context.findType(arg.typeDecl.type);
          logging.debug("" + this.nodeType + " scanPass3: Type of argument " + i + " determined as " + arg.type.name);
        }
        context.enterFunctionScope();
        this.code.scanPass2(context);
        context.exitFunctionScope();
      };

      FunctionDefinition.prototype.scanPass3 = function(context) {
        var arg, i, value, _i, _len, _ref;
        logging.debug("" + this.nodeType + " scanPass3");
        context.enterFunctionScope();
        _ref = this.args;
        for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
          arg = _ref[i];
          logging.debug("" + this.nodeType + ": Creating value for argument " + i + " (" + arg.varDecl.name + ")");
          if (arg.varDecl.array != null) {
            logging.debug("" + this.nodeType + ": Argument is of array type");
            arg.type = new typesModule.createArrayType(arg.type);
          }
          value = context.createValue(arg.type, arg.varDecl.name);
          arg.varDecl.value = value;
        }
        this.code.scanPass3(context);
        context.exitFunctionScope();
        this._ckFunc = context.addFunction(this);
      };

      FunctionDefinition.prototype.scanPass4 = function(context) {
        var arg, i, value, _i, _len, _ref;
        logging.debug("" + this.nodeType + " scanPass4");
        context.enterFunctionScope();
        _ref = this.args;
        for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
          arg = _ref[i];
          value = arg.varDecl.value;
          logging.debug("" + this.nodeType + " scanPass4: Adding parameter " + i + " (" + value.name + ") to function's scope");
          context.addValue(value);
        }
        this.code.scanPass4(context);
        context.exitFunctionScope();
      };

      FunctionDefinition.prototype.scanPass5 = function(context) {
        var arg, i, local, value, _i, _len, _ref;
        logging.debug("" + this.nodeType + " emitting");
        logging.debug("" + this.nodeType + ": Emitting constant corresponding to function");
        local = context.allocateLocal(this._ckFunc.value.type, this._ckFunc.value, false);
        context.emitStoreConst(local.ri, this._ckFunc);
        context.pushCode("" + this._ckFunc.name + "( ... )");
        context.enterCodeScope();
        _ref = this.args;
        for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
          arg = _ref[i];
          value = arg.varDecl.value;
          logging.debug("" + this.nodeType + " scanPass5: Allocating local variable for parameter " + i + " (" + value.name + ")");
          local = context.allocateLocal(value.type, value, false);
        }
        this.code.scanPass5(context);
        context.exitCodeScope();
        context.emitFuncReturn();
        this._ckFunc.code = context.popCode();
      };

      return FunctionDefinition;

    })(NodeBase);
    module.Arg = Arg = (function(_super) {
      __extends(Arg, _super);

      function Arg(typeDecl, varDecl) {
        this.typeDecl = typeDecl;
        this.varDecl = varDecl;
        Arg.__super__.constructor.call(this, "Arg");
      }

      return Arg;

    })(NodeBase);
    return module;
  });

}).call(this);

(function() {
  define("chuck/parserService", ["chuck/lexer", "chuck/nodes", "chuck/logging"], function(lexer, nodes, logging) {
    var yy;
    yy = _.extend({}, nodes);
    yy.addLocationDataFn = function(first, last) {
      return function(obj) {
        return obj;
      };
    };
    return {
      parse: function(sourceCode) {
        var parser, tokens;
        parser = new ChuckParser();
        parser.yy = yy;
        parser.lexer = {
          lex: function() {
            var tag, token;
            token = this.tokens[this.pos++];
            if (token) {
              tag = token[0], this.yytext = token[1], this.yylloc = token[2];
              this.yylineno = this.yylloc.first_line;
            } else {
              tag = '';
            }
            return tag;
          },
          setInput: function(tokens) {
            this.tokens = tokens;
            return this.pos = 0;
          },
          upcomingInput: function() {
            return "";
          }
        };
        tokens = lexer.tokenize(sourceCode);
        logging.debug("Parsing tokens:", tokens);
        return parser.parse(tokens);
      }
    };
  });

}).call(this);

define("chuck/ugen", ["chuck/types", "chuck/logging", "chuck/audioContextService"], function (types, logging,
  audioContextService) {
  var module = {}

  function initializeUGen(self, type) {
    self.type = type
    self.size = self.type.size
    self.pmsg = self.type.ugenPmsg
    self.numIns = self.type.ugenNumIns
    self.numOuts = self.type.ugenNumOuts
    self._now = -1
    self._destList = []
    self._gain = 1
  }

  module.MultiChannelUGen = function MultiChannelUGen(type) {
    var i, self = this

    initializeUGen(this, type);

    self._channels = []
    for (i = 0; i < self.numIns; ++i) {
      self._channels.push(new module.MonoUGen(type, self))
    }
  }
  module.MultiChannelUGen.prototype.stop = function () {
    var self = this, i
    for (i = 0; i < self._channels.length; ++i) {
      self._channels[i]._stop()
    }
  }
  module.MultiChannelUGen.prototype.tick = function (now) {
    var self = this,
      i
    if (self._now >= now) {
      return
    }

    self._now = now

    // Tick channels
    for (i = 0; i < self._channels.length; ++i) {
      self._channels[i].tick(now)
    }
  }
  module.MultiChannelUGen.prototype.add = function add(src) {
    var self = this, i, srcUGens
    srcUGens = src instanceof module.MonoUGen ? [src, src] : src._channels
    for (i = 0; i < self._channels.length; ++i) {
      self._channels[i].add(srcUGens[i])
    }
  }
  module.MultiChannelUGen.prototype.remove = function (src) {
    var self = this, i
    for (i = 0; i < self._channels.length; ++i) {
      self._channels[i].remove(src)
    }
  }
  module.MultiChannelUGen.prototype.setGain = function (gain) {
    var self = this, i
    for (i = 0; i < self._channels.length; ++i) {
      self._channels[i].setGain(gain)
    }
    return gain
  }

  module.MonoUGen = function MonoUGen(type, parent) {
    var self = this
    initializeUGen(self, type)
    self.parent = parent
    self.current = 0
    self.pan = 1
    self._tick = type.ugenTick ? type.ugenTick : function (input) {
      return input
    }
    self.sources = []
  }
  module.MonoUGen.prototype.tick = function tick(now) {
    var self = this, i, source, sum

    if (self._now >= now) {
      return self.current
    }

    // Don't change self.current until after finishing computations, since other nodes that use our output in the
    // meantime should use the previously output sample
    sum = 0
    self._now = now

    // Tick sources
    if (self.sources.length > 0) {
      for (i = 0; i < self.sources.length; ++i) {
        source = self.sources[i]
        source.tick(now)
        sum += source.current
      }
    }

    // Synthesize
    self.current = self._tick.call(self, sum) * self._gain * self.pan
    return self.current
  }
  module.MonoUGen.prototype.setGain = function (gain) {
    var self = this
    self._gain = gain
    return gain
  }
  module.MonoUGen.prototype.add = function (src) {
    var self = this, i, srcUGens
    srcUGens = src instanceof module.MonoUGen ? [src] : src._channels
    for (i = 0; i < srcUGens.length; ++i) {
      logging.debug("UGen: Adding source #" + self.sources.length)
      self.sources.push(srcUGens[i])
      srcUGens[i]._destList.push(self)
    }
  }
  module.MonoUGen.prototype.remove = function (src) {
    var self = this, i, srcUGens
    srcUGens = src instanceof module.MonoUGen ? [src] : src._channels
    for (i = 0; i < srcUGens.length; ++i) {
      var idx = _.find(self.sources, function (s) { return s === srcUGens[i] })
      logging.debug("UGen: Removing source #" + idx)
      self.sources.splice(idx, 1)

      srcUGens[i]._removeDest(self)
    }
  }
  module.MonoUGen.prototype._removeDest = function (dest) {
    var self = this, idx
    idx = _.find(self._destList, function (d) {
      return d === dest
    })
    logging.debug("UGen: Removing destination " + idx)
    self._destList.splice(idx, 1)
  }
  module.MonoUGen.prototype._stop = function () {
    var self = this
    self.sources.splice(0, self.sources.length)
  }

  module.Dac = function Dac() {
    var self = this
    self._node = audioContextService.outputNode
    module.MultiChannelUGen.call(self, types.types.Dac)
  }
  module.Dac.prototype = Object.create(module.MultiChannelUGen.prototype)
  module.Dac.prototype.tick = function (now, frame) {
    var self = this,
      i
    module.MultiChannelUGen.prototype.tick.call(self, now)
    for (i = 0; i < frame.length; ++i) {
      frame[i] = self._channels[i].current
    }
  }

  function Bunghole() {
    var self = this
    module.MonoUGen.call(self, types.types.Bunghole)
  }
  Bunghole.prototype = Object.create(module.MonoUGen.prototype)
  module.Bunghole = Bunghole

  return module
})
;
define("chuck/instructions", ["chuck/ugen", "chuck/logging", "chuck/types"], function (ugen, logging, typesModule) {
  var module = {}
  var types = typesModule.types

  var logDebug = function () {
//    logging.debug.apply(null, arguments)
  }

  function callFunction(vm, func, ri, riRet) {
    var stackDepth = func.stackDepth
    logDebug("Calling function", func)
    logDebug("Passing registers " + ri + " to " + (ri + stackDepth - 1) + " as arguments")
    var args = vm.registers.slice(ri, ri+stackDepth)
    var thisObj = undefined
    if (func.isMember) {
      logDebug("Function is a method, passing 'this' to it")
      thisObj = args.shift()
    }
    var retVal = func.apply(thisObj, args)
    if (func.retType != types.void) {
      logDebug("Assigning return value to register " + riRet + ":", retVal)
      vm.registers[riRet] = retVal
    }
  }

  function Instruction(name, params, execute) {
    var self = this
    self.instructionName = name
    _.extend(self, params)
    self._executeCb = execute
  }
  Instruction.prototype.execute = function (vm) {
    var self = this
    if (!self._executeCb) {
      return
    }
    self._executeCb.call(self, vm)
  }
  module.Instruction = Instruction

  function instantiateObject(type, vm) {
    logDebug("Instantiating object of type " + type.name)
    var ug = type.ugenNumOuts == 1 ? new ugen.MonoUGen(type) : new ugen.MultiChannelUGen(type)
    vm.addUgen(ug)
    return ug
  }
  module.instantiateObject = function (type, ri) {
    return new Instruction("InstantiateObject", { type: type }, function (vm) {
      var ug = instantiateObject(type, vm)
      vm.registers[ri] = ug
    })
  }

  module.preConstructor = function (type, ri) {
    return new Instruction("PreConstructor", {type: type}, function (vm) {
      // Duplicate top of stack, which should be object pointer
      logDebug("Calling pre-constructor of " + this.type.name)
//       Signal that this function needs a 'this' reference
      this.type.preConstructor.isMember = true
      this.type.preConstructor.stackDepth = 1
      this.type.preConstructor.retType = types.void

      callFunction(vm, this.type.preConstructor, ri)
    })
  }

  module.assignObject = function (isArray, isGlobal, r1, r2) {
    if (isGlobal == null) {isGlobal = true}
    return new Instruction("AssignObject", {}, function (vm) {
      var scopeStr = isGlobal ? "global" : "function"
      var tgtRegisters = isGlobal ? vm.globalRegisters : vm.registers
      var obj = vm.registers[r1]
      if (!isArray) {
        logDebug(this.instructionName + ": Assigning object to register " + r2 + " (scope: " + scopeStr + "):", obj)
        tgtRegisters[r2] = obj
      }
      else {
        var array = vm.registers[r2][0]
        var index = vm.registers[r2][1]
        logDebug("#{@instructionName}: Assigning object to array, index #{index} (scope: #{scopeStr}):", obj)
        array[index] = obj
      }
    })
  }

  module.plusAssign = function (r1, r2, r3) {
    return new Instruction("PlusAssign", {}, function (vm) {
      var lhs = vm.registers[r1]
      var rhs = vm.registers[r2]
      var result = lhs + rhs
      vm.registers[r3] = result
    })
  }
  module.minusAssign = function (r1, r2, r3) {
    return new Instruction("MinusAssign", {}, function (vm) {
      var lhs = vm.registers[r1]
      var rhs = vm.registers[r2]
      var result = lhs - rhs
      logDebug(this.instructionName + ": Subtracting " + lhs + " with " + rhs + " and assigning result in " + result)
      vm.registers[r3] = result
    })
  }

  module.allocateArray = function (type, r1, r2) {
    return new Instruction("AllocateArray", {}, function (vm) {
      var sz = vm.registers[r1]
      logDebug(this.instructionName + ": Allocating array of type " + type.name + " and of size " + sz +
        " in register " + r2)
      var array = new Array(sz)
      var i
      for (i = 0; i < sz; ++i) {
        array[i] = 0
      }
      vm.registers[r2] = array
//
//      if (typesModule.isObj(type.arrayType)) {
////         Push index
//        logDebug("#{@instructionName}: Pushing index to stack")
//        vm.pushToReg(0)
//      }
    })
  }

  module.dac = function () {
    return new Instruction("Dac", {}, function (vm) {
      vm.pushDac()
    })
  }

  module.bunghole = function () {
    return new Instruction("Bunghole", {}, function (vm) {
      vm.pushBunghole()
    })
  }

  module.eoc = function () {return new Instruction("Eoc") }

  module.uGenLink = function (r1, r2) {
    return new Instruction("UGenLink", {}, function (vm) {
      var src = vm.registers[r1]
      var dest = vm.registers[r2]
      logDebug("UGenLink: Linking node of type " + src.type.name + " to node of type " + dest.type.name)
      dest.add(src)
    })
  }

  module.uGenUnlink = function (r1, r2) {
    return new Instruction("UGenUnlink", {}, function (vm) {
      var src = vm.registers[r1]
      var dest = vm.registers[r2]
      logDebug("#{@instructionName}: Unlinking node of type " + src.type.name + " from node of type " + dest.type.name)
      dest.remove(src)
    })
  }

  module.funcCall = function (r1, argRegisters) {
    return new Instruction("FuncCall", {}, function (vm) {
      var func = vm.registers[r1], i
      var stackDepth = func.stackDepth
      logDebug(this.instructionName + ": Calling function " + func.name + ", with stackDepth " + stackDepth)

      // Read arguments from enclosing scope
      var args = argRegisters.map(function (ri) {
        return vm.registers[ri]
      })

      logDebug(this.instructionName + ": Pushing current instruction set and instruction counter to instructions stack")
      vm.instructionsStack.push([vm.instructions, vm._pc+1])
      vm._nextPc = 0
      vm.instructions = func.code.instructions
      vm.enterFunctionScope()

      // Assign arguments to local registers
      logDebug(this.instructionName + ": Copying " + args.length + " arguments to function registers")
      for (i = 0; i < args.length; ++i) {
        // The first register is reserved for the return value
        vm.registers[i+1] = args[i]
      }
    })
  }

  module.funcReturn = function () {
    return new Instruction("FuncReturn", {}, function (vm) {
      logDebug(this.instructionName + ": Returning from function")
      vm.exitFunctionScope()

      logDebug(this.instructionName + ": Popping current instructions and instruction counter from instructions stack")
      var instructionsAndPc = vm.instructionsStack.pop()
      vm.instructions = instructionsAndPc[0]
      vm._nextPc = instructionsAndPc[1]
    })
  }

  module.regPushMemAddr =  function(offset, isGlobal) {
    return new Instruction("RegPushMemAddr", {}, function (vm) {
      var globalStr = isGlobal ? " global" : ""
      logDebug("#{@instructionName}: Pushing#{globalStr} memory address (@#{offset}) to regular stack")
      vm.pushMemAddrToReg(offset, isGlobal)
    })
  }
  module.regPushMem = function (offset, isGlobal) {
    return new Instruction("RegPushMem", {offset: offset, isGlobal: isGlobal})
  }

  module.regDupLast = function () {
    return new Instruction("RegDupLast", {}, function (vm) {
      var last = vm.regStack[vm.regStack.length - 1]
      logDebug("RegDupLast: Duplicating top of stack: #{last}")
      vm.regStack.push(last)
    })
  }

  module.dotStaticFunc = function (func) {
    return new Instruction("DotStaticFunc", {}, function (vm) {
      logDebug("DotStaticFunc: Pushing static method to stack:", func)
      vm.pushToReg(func)
    })
  }

  module.divideNumber = function (r1, r2, r3) {
    return new Instruction("DivideNumber", {}, function (vm) {
      var lhs = vm.registers[r1]
      var rhs = vm.registers[r2]
      var number = lhs / rhs
      logDebug("DivideNumber (" + lhs + "/" + rhs + ") resulted in: " + number)
      vm.registers[r3] = number
    })
  }

  module.regPushMe = function () {
    return new Instruction("RegPushMe", {}, function (vm) {
      vm.pushMe()
    })
  }

  module.preIncNumber = function (r1, r2) {
    return new Instruction("PreIncNumber", {}, function (vm) {
      var val = vm.registers[r1]
      ++val
      vm.registers[r1] = vm.registers[r2] = val
    })
  }

  module.postIncNumber = function (r1, r2) {
    return new Instruction("PostIncNumber", {}, function (vm) {
      var val = vm.registers[r1]
      vm.registers[r2] = val
      vm.registers[r1] = ++val
    })
  }

  module.subtractNumber = function (r1, r2, r3) {
    return new Instruction("SubtractNumber", {}, function (vm) {
      var lhs = vm.registers[r1]
      var rhs = vm.registers[r2]
      var number = lhs - rhs
      logDebug("#{@instructionName}: Subtracting " + rhs + " from " + lhs + " resulted in: " + number)
      vm.registers[r3] = number
    })
  }

  module.gtNumber = function () {
    return new Instruction("GtNumber", {}, function (vm) {
      var rhs = vm.popFromReg()
      var lhs = vm.popFromReg()
      var result = lhs > rhs
      logDebug("#{@instructionName}: Pushing #{result} to regular stack")
      vm.pushToReg(result)
    })
  }

  function formatFloat(value) { return value.toFixed(6) }

  module.gack = function (types, registers) {
    return new Instruction("Gack", {}, function (vm) {
      if (types.length === 1) {
        module.hack(types[0], registers[0]).execute(vm)
        return
      }

      var values = _.map(registers, function (ri) {
        return vm.registers[ri]
      })
      var str = "", i
      for (i = 0; i < types.length; ++i) {
        var tp = types[i]
        var value = values[i]
        if (tp === types.float) {
          str += formatFloat(value) + ' '
        }
        else {
          str += value + ' '
        }
      }

      console.log(str.slice(0, str.length - 1))
    })
  }

  module.hack = function (type, r1) {
    return new Instruction("Hack", {}, function (vm) {
      var obj = vm.registers[r1]
      logDebug("Printing object of type " + type.name + ":", obj)
      if ( _.isArray(obj)) {
        var arrStr = _.str.join(",", obj)
        console.log("[" + arrStr + "] :(" + type.name + "[])")
        return
      }
      if (type === types.String) {
        console.log("\"" + obj + "\" : (" + type.name + ")")
      }
      else if (type === types.float || type === types.dur) {
        console.log(formatFloat(obj) + " :(" + type.name + ")")
      }
      else if (type === types.int) {
        console.log(obj + " :(" + type.name + ")")
      }
      else {
        console.log(obj + " : (" + type.name + ")")
      }
    })
  }

  module.goto = function (jmp) {
    return new Instruction("Goto", {jmp: jmp}, function (vm) {
      logDebug("Jumping to instruction number " + this.jmp)
      vm.jumpTo(this.jmp)
    })
  }

  module.arrayAccess = function (type, r1, r2, r3, emitAddr) {
    return new Instruction("ArrayAccess", {}, function (vm) {
      logDebug("#{@instructionName}: Accessing array of type #{type.name}")
      var array = vm.registers[r1]
      var idx = vm.registers[r2]
      var val
      if (!emitAddr) {
        val = array[idx]
        logDebug("Pushing array[#{idx}] (#{val}) to regular stack")
        vm.registers[r3] = val
      }
      else {
        logDebug("Pushing array (#{array}) and index (#{idx}) to regular stack")
        vm.registers[r3] = [array, idx]
      }
    })
  }

  function UnaryOpInstruction(name, params, execute) {
    var self = this
    Instruction.call(self, name, params, execute)
    self.val = 0
  }
  UnaryOpInstruction.prototype = Object.create(Instruction.prototype)
  UnaryOpInstruction.prototype.set = function (val) {
    var self = this
    self._val = val
  }

  module.preCtorArray = function (type, r1, r2, typesWithCtors) {
    return new UnaryOpInstruction("PreCtorArray", {}, function (vm) {
      var length = vm.registers[r1]
      var array = vm.registers[r2]
      var i, obj, j, typeWithCtor
      logDebug("Instantiating " + length + " array elements of type " + type.name)
      for (i = 0; i < length; ++i) {
        obj = instantiateObject(type, vm)
        for (j = 0; j < typesWithCtors.length; ++j) {
          typeWithCtor = typesWithCtors[j]
          logDebug("Calling pre-constructor for type " + typeWithCtor.name)
          typeWithCtor.preConstructor.call(obj)
        }
        array[i] = obj
      }
      logDebug(this.instructionName + ": Finished instantiating elements")
    })
  }

  module.preCtorArrayBottom = function (r1, r2) {
    return new UnaryOpInstruction("PreCtorArrayBottom", {}, function (vm) {
      logDebug("#{@instructionName}: Popping object and index from stack")
      var obj = vm.popFromReg()
      var index = vm.popFromReg()
      logDebug("#{@instructionName}: Peeking array from stack")
      var array = vm.peekReg()

      logDebug("#{@instructionName}: Assigning to index #{index} of array:", obj)
      array[index] = obj
//     Increment index
      logDebug("#{@instructionName}: Pushing incremented index to stack")
      vm.pushToReg(index + 1)

//     Goto top
      logDebug("#{@instructionName}: Jumping to instruction " + this._val)
      vm.jumpTo(this._val)
    })
  }

  module.arrayInit = function (type, registers, ri) {
    return new Instruction("ArrayInit", {}, function (vm) {
      logDebug(this.instructionName + ": Creating an array of " + registers.length + " element(s)")
      var values = _.map(registers, function (ri) {
        return vm.registers[ri]
      })
      logDebug(this.instructionName + ": Assigning instantiated array to register " + ri + ":", values)
      vm.registers[ri] = values
    })
  }

  module.negateNumber = function (r1, r2) {
    return new Instruction("NegateNumber", {}, function (vm) {
      var number = vm.registers[r1]
      vm.registers[r2] = -number
      logDebug("#{@instructionName}: Assigning negated number in register " + r1 + " to register " + r2)
    })
  }

  return module
})
;
(function() {
  define("chuck/libs/math", ["chuck/types"], function(typesModule) {
    var ChuckStaticMethod, ChuckType, FuncArg, FunctionOverload, Object, float, int, mathNamespace, module, types, _ref;
    ChuckType = typesModule.ChuckType, ChuckStaticMethod = typesModule.ChuckStaticMethod, FuncArg = typesModule.FuncArg, FunctionOverload = typesModule.FunctionOverload;
    _ref = typesModule.types, Object = _ref.Object, float = _ref.float, int = _ref.int;
    module = {};
    types = module.types = {};
    mathNamespace = {
      pow: new ChuckStaticMethod("pow", [
        new FunctionOverload([new FuncArg("x", float), new FuncArg("y", float)], function(x, y) {
          return Math.pow(x, y);
        })
      ], "Math", float),
      random2: new ChuckStaticMethod("random2", [
        new FunctionOverload([new FuncArg("min", int), new FuncArg("max", int)], function(min, max) {
          return Math.floor(Math.random() * (max - min + 1)) + min;
        })
      ], "Math", int),
      random2f: new ChuckStaticMethod("random2f", [
        new FunctionOverload([new FuncArg("min", float), new FuncArg("max", float)], function(min, max) {
          return Math.random() * (max - min) + min;
        })
      ], "Math", float),
      log: new ChuckStaticMethod("log", [
        new FunctionOverload([new FuncArg("x", float)], function(x) {
          return Math.log(x);
        })
      ], "Math", float),
      sin: new ChuckStaticMethod("sin", [
        new FunctionOverload([new FuncArg("x", float)], function(x) {
          return Math.sin(x);
        })
      ], "Math", float)
    };
    types.Math = new ChuckType("Math", Object, {
      namespace: mathNamespace
    });
    return module;
  });

}).call(this);

(function() {
  define("chuck/libs/std", ["chuck/types"], function(typesModule) {
    var ChuckStaticMethod, ChuckType, FuncArg, FunctionOverload, Object, float, int, module, stdNamespace, types, _ref;
    ChuckType = typesModule.ChuckType, ChuckStaticMethod = typesModule.ChuckStaticMethod, FuncArg = typesModule.FuncArg, FunctionOverload = typesModule.FunctionOverload;
    _ref = typesModule.types, Object = _ref.Object, float = _ref.float, int = _ref.int;
    module = {};
    types = module.types = {};
    stdNamespace = {
      mtof: new ChuckStaticMethod("mtof", [
        new FunctionOverload([new FuncArg("value", float)], function(value) {
          return Math.pow(2, (value - 69) / 12) * 440;
        })
      ], "Std", float),
      fabs: new ChuckStaticMethod("fabs", [
        new FunctionOverload([new FuncArg("value", float)], function(value) {
          return Math.abs(value);
        })
      ], "Std", float)
    };
    types.Std = new ChuckType("Std", Object, {
      namespace: stdNamespace
    });
    return module;
  });

}).call(this);

// STK library
define("chuck/libs/stk", ["chuck/types", "chuck/audioContextService", "chuck/logging"], function (
  typesModule, audioContextService, logging) {
  var ChuckType = typesModule.ChuckType,
    ChuckMethod = typesModule.ChuckMethod,
    FuncArg = typesModule.FuncArg,
    FunctionOverload = typesModule.FunctionOverload,
    float = typesModule.types.float,
    int = typesModule.types.int,
    dur = typesModule.types.dur,
    UGen = typesModule.types.UGen,
    Osc = typesModule.types.Osc,
    void_ = typesModule.types.void,
    module = {},
    types = module.types = {};

  function isPrime(number) {
    var i;
    if (number === 2) {
      return true;
    }
    if (number & 1) {
      for (i = 3; i < Math.sqrt(number) + 1; i += 2) {
        if ((number % i) === 0) return false;
      }
      return true
    }

    return false
  }

  function Delay(delay, max) {
    var self = this;
    if (delay == null) {
      delay = 0
    }
    if (max == null) {
      max = 4096
    }

    // Writing before reading allows delays from 0 to length-1.
    // If we want to allow a delay of maxDelay, we need a
    // delay-line of length = maxDelay+1.
    self.length = max + 1;

    self.clear();

    self.inPoint = 0;

    if (delay > self.length - 1) {
      // The value is too big.
      // Force delay to maxLength.
      self.outPoint = self.inPoint + 1;
      delay = self.length - 1;
    }
    else if (delay < 0) {
      self.outPoint = self.inPoint;
      delay = 0;
    }
    else {
      self.outPoint = self.inPoint - delay;  // read chases write
    }
    self.delay = delay;

    while (self.outPoint < 0) {
      self.outPoint += self.length;  // modulo maximum length
    }
  }

  Delay.prototype.clear = function () {
    var self = this, i
    self.inputs = [];
    for (i = 0; i < self.length; ++i) {
      self.inputs.push(0);
    }
    self.output = 0;
  };
  Delay.prototype.tick = function (sample) {
    var self = this;
    self.inputs[self.inPoint++] = sample;
    // Check for end condition
    if (self.inPoint >= self.length) {
      self.inPoint = 0;
    }

    // Read out next value
    self.output = self.inputs[self.outPoint++];
    if (self.outPoint >= self.length) {
      self.outPoint = 0;
    }

    return self.output;
  };
  Delay.prototype.setDelay = function (delay) {
    var self = this
    if (delay > (self.length-1)) { // The value is too big.
      // Force delay to maxLength.
      self.outPoint = self.inPoint + 1
      self.delay = self.length - 1
    }
    else if (delay < 0) {
      self.outPoint = self.inPoint
      self.delay = 0
    }
    else {
      self.outPoint = self.inPoint - Math.floor(delay)  // read chases write
      self.delay = delay
    }

    while (self.outPoint < 0) {
      self.outPoint += self.length  // modulo maximum length
    }
  }
  types.Delay = Delay

  types.JcReverb = new ChuckType("JCRev", UGen, {
    preConstructor: function () {
      // Delay lengths for 44100 Hz sample rate.
      var lengths = [1777, 1847, 1993, 2137, 389, 127, 43, 211, 179];
      var i,
        delay,
        sampleRate = audioContextService.getSampleRate(),
        scaler = sampleRate / 44100,
        d,
        t60 = 4;

      d = this.data = {
        mix: 0.3,
        allpassDelays: [],
        combDelays: [],
        combCoefficient: [],
        allpassCoefficient: 0.7,
        lastOutput: []
      };

      if (scaler !== 1.0) {
        for (i = 0; i < 9; ++i) {
          delay = Math.floor(scaler * lengths[i]);
          if ((delay & 1) === 0) {
            delay++;
          }
          while (!isPrime(delay)) {
            delay += 2;
          }
          lengths[i] = delay;
        }
      }

      for (i = 0; i < 3; i++) {
        d.allpassDelays.push(new Delay(lengths[i + 4], lengths[i + 4]));
      }

      for (i = 0; i < 4; i++) {
        d.combDelays.push(new Delay(lengths[i], lengths[i]));
        d.combCoefficient.push(Math.pow(10.0, (-3 * lengths[i] / (t60 * sampleRate))));
      }

      d.outLeftDelay = new Delay(lengths[7], lengths[7]);
      d.outRightDelay = new Delay(lengths[8], lengths[8]);

      [d.allpassDelays, d.combDelays, [d.outRightDelay, d.outLeftDelay]].forEach(function (e) {
        e.forEach(function (delay) {
          delay.clear();
        });
      });
      d.lastOutput[0] = d.lastOutput[1] = 0;
    },
    namespace: {
      mix: new ChuckMethod("mix", [new FunctionOverload([
          new FuncArg("value", float)],
        function (value) {
          this.data.mix = value;
          return this.data.mix;
        })], "JCRev", float)
    },
    ugenTick: function (input) {
      var self = this,
        d = self.data,
        temp, temp0, temp1, temp2, temp3, temp4, temp5, temp6,
        filtout;

      temp = d.allpassDelays[0].output
      temp0 = d.allpassCoefficient * temp
      temp0 += input
      d.allpassDelays[0].tick(temp0)
      temp0 = -(d.allpassCoefficient * temp0) + temp;

      temp = d.allpassDelays[1].output;
      temp1 = d.allpassCoefficient * temp;
      temp1 += temp0
      d.allpassDelays[1].tick(temp1);
      temp1 = -(d.allpassCoefficient * temp1) + temp;

      temp = d.allpassDelays[2].output;
      temp2 = d.allpassCoefficient * temp;
      temp2 += temp1;
      d.allpassDelays[2].tick(temp2);
      temp2 = -(d.allpassCoefficient * temp2) + temp;

      temp3 = temp2 + (d.combCoefficient[0] * d.combDelays[0].output);
      temp4 = temp2 + (d.combCoefficient[1] * d.combDelays[1].output);
      temp5 = temp2 + (d.combCoefficient[2] * d.combDelays[2].output);
      temp6 = temp2 + (d.combCoefficient[3] * d.combDelays[3].output);

      d.combDelays[0].tick(temp3);
      d.combDelays[1].tick(temp4);
      d.combDelays[2].tick(temp5);
      d.combDelays[3].tick(temp6);

      filtout = temp3 + temp4 + temp5 + temp6;

      d.lastOutput[0] = d.mix * (d.outLeftDelay.tick(filtout));
      d.lastOutput[1] = d.mix * (d.outRightDelay.tick(filtout));
      temp = (1.0 - d.mix) * input;
      d.lastOutput[0] += temp;
      d.lastOutput[1] += temp;

      return (d.lastOutput[0] + d.lastOutput[1]) * 0.5;
    }
  });

  function blitSetFrequency(self, frequency) {
    var sampleRate = audioContextService.getSampleRate(),
      d = self.data

    d.p = sampleRate / frequency
    d.rate = Math.PI / d.p
    d.phase = 0
    blitUpdateHarmonics(self)
  }

  function blitUpdateHarmonics(self) {
    var d = self.data,
      maxHarmonics

    if (d.nHarmonics <= 0) {
      maxHarmonics = Math.floor(0.5 * d.p)
      d.m = 2 * maxHarmonics + 1
    }
    else
      d.m = 2 * d.nHarmonics + 1
  }

  types.Blit = new ChuckType("Blit", Osc, {
    preConstructor: function () {
      var self = this,
        d = self.data
      d.nHarmonics = 0
      self.setFrequency = function (frequency) {
        blitSetFrequency(self, frequency)
        return frequency
      }
      blitSetFrequency(self, 220)
    },
    namespace: {
      harmonics: new ChuckMethod("harmonics", [new FunctionOverload([
          new FuncArg("nHarmonics", int)],
        function (nHarmonics) {
          this.data.nHarmonics = nHarmonics
          return this.data.nHarmonics
        })], "Blit", int)
    },
    ugenTick: function () {
      var d = this.data,
        out,
        denominator
      // The code below implements the SincM algorithm of Stilson and
      // Smith with an additional scale factor of P / M applied to
      // normalize the output.

      // A fully optimized version of this code would replace the two sin
      // calls with a pair of fast sin oscillators, for which stable fast
      // two-multiply algorithms are well known. In the spirit of STK,
      // which favors clarity over performance, the optimization has not
      // been made here.

      // Avoid a divide by zero at the sinc peak, which has a limiting
      // value of 1.0.
      denominator = Math.sin(d.phase)
      if (denominator <= Number.EPSILON) {
        out = 1.0
      }
      else {
        out = Math.sin(d.m * d.phase)
        out /= d.m * denominator
      }

      d.phase += d.rate
      if (d.phase >= Math.PI) {
        d.phase -= Math.PI
      }

      return out
    }
  })

  function setEnvelopeTime(time) {
    if (time < 0) {
      time = -time
    }

    var d = this.data
    if (time === 0) {
      d.rate = Number.MAX_VALUE
    }
    else {
      d.rate = (d.target - d.value) / (time * audioContextService.getSampleRate())
    }

    if (d.rate < 0) {
      d.rate = -d.rate
    }
    d.time = time

    return time
  }

  function envelopeKeyOn(enable) {
    if (enable != null && !enable) {
      envelopeKeyOff.call(this, 1)
      return 0
    }

    var d = this.data;
    d.target = d.mTarget
    if (d.value !== d.target) {
      d.state = 1
    }

    setEnvelopeTime.call(this, d.time)

    return 1
  }

  function envelopeKeyOff(enable) {
    if (enable != null && !enable) {
      envelopeKeyOn.call(this, 1)
      return 0
    }

    var d = this.data;
    d.target = 0
    if (d.value !== d.target) {
      d.state = 1
    }
    setEnvelopeTime.call(this, d.time)
    return 1
  }

  types.Envelope = new ChuckType("Envelope", UGen, {
    preConstructor: function () {
      var self = this;
      self.data = {
        target: 0,
        value: 0,
        rate: 0.001,
        mTarget: 1,
        state: 0
      }

      self.data.time = self.data.mTarget / (self.data.rate * audioContextService.getSampleRate())
    },
    namespace: {
      keyOn: new ChuckMethod("keyOn", [
        new FunctionOverload([new FuncArg("enable", int)], envelopeKeyOn),
        new FunctionOverload([], envelopeKeyOn)
      ], "Envelope", int),
      keyOff: new ChuckMethod("keyOff", [
        new FunctionOverload([new FuncArg("enable", int)], envelopeKeyOff),
        new FunctionOverload([], envelopeKeyOff)
      ], "Envelope", int),
      time: new ChuckMethod("time", [new FunctionOverload([new FuncArg("time", float)], setEnvelopeTime)], "Envelope",
        dur),
      duration: new ChuckMethod("duration", [
        new FunctionOverload([], function () {
          var d = this.data
          return d.time * audioContextService.getSampleRate()
        }),
        new FunctionOverload([new FuncArg("duration", dur)], function (duration) {
          setEnvelopeTime.call(this, duration/audioContextService.getSampleRate())
          return duration
        })
      ], "Envelope", dur)
    },
    ugenTick: function (input) {
      var d = this.data

      if (d.state) {
        if (d.target > d.value) {
          d.value += d.rate;
          if (d.value >= d.target) {
            d.value = d.target;
            d.state = 0;
          }
        }
        else {
          d.value -= d.rate;
          if (d.value <= d.target) {
            d.value = d.target;
            d.state = 0;
          }
        }
      }

      return input * d.value
    }
  });

  types.Adsr = new ChuckType("ADSR", types.Envelope, {
    preConstructor: function () {
      var d = this.data;
      d.attackRate = 0.001;
      d.decayRate = 0.001;
      d.sustainLevel = 0.5;
      d.releaseRate = 0.01;
      d.state = "attack";
      d.rate = 1;
      d.value = 0;
    },
    namespace: {
      set: new ChuckMethod("set", [new FunctionOverload([
          new FuncArg("attack", dur), new FuncArg("decay", dur),
          new FuncArg("sustain", float), new FuncArg("release", dur)],
        function (attack, decay, sustainLevel, release) {
          function computeRate(target, time) {
            return target / time
          }

          var d = this.data
          d.attackRate = computeRate(1, attack)
          d.decayRate = computeRate(1 - sustainLevel, decay)
          d.releaseRate = computeRate(sustainLevel, release)
          d.sustainLevel = sustainLevel
//          logging.debug("Having set ADSR parameters, at attack state: " + d.attackRate + ", " +  d.decayRate + ", " +
//            sustainLevel + ", " + d.releaseRate)
        })], "ADSR", void_),
      keyOn: new ChuckMethod("keyOn", [new FunctionOverload([], function () {
        var d = this.data;
//        logging.debug("keyOn state")
        d.target = 1
        d.rate = d.attackRate
        d.state = "attack"
      })], "ADSR", void_),
      keyOff: new ChuckMethod("keyOff", [new FunctionOverload([], function () {
        var d = this.data;
//        logging.debug("keyOff state")
        d.rate = d.releaseRate;
        d.target = 0;
        d.state = "release";
      })], "ADSR", void_)
    },
    ugenTick: function (input) {
      var d = this.data;
      switch (d.state) {
        case "attack":
          d.value += d.rate;
//          logging.debug("Attack state: value set to #{d.value}")
          if (d.value >= d.target) {
            d.value = d.target
            d.rate = d.decayRate
            d.target = d.sustainLevel
            d.state = "decay"
//            logging.debug("Transitioned to decay state, value: #{d.value}")
          }
          break;
        case "decay":
          d.value -= d.decayRate;

//          logging.debug("Decay state: value set to #{d.value}")
          if (d.value <= d.sustainLevel) {
            d.value = d.sustainLevel
            d.rate = 0;
            d.state = "sustain";
//            logging.debug("Transitioned to sustain state, value: #{d.value}")
          }
          break;
        case "release":
          d.value -= d.rate;
//          logging.debug("Release state: value set to #{d.value}")
          if (d.value <= 0) {
            d.value = 0;
            d.state = "done";
//            logging.debug("Transitioned to done state, value: #{d.value}")
          }
          break;
      }

//      logging.debug("State At end")
      return input * d.value;
    }
  });

  types.Delay = new ChuckType("Delay", UGen, {
    preConstructor: function () {
      var d = this.data = {}
      d.delay = new Delay()
    },
    namespace: {
      delay: new ChuckMethod("delay", [new FunctionOverload([
          new FuncArg("value", dur)],
        function (value) {
          this.data.delay.setDelay(value)
          return value
        })], "Delay", dur)
    },
    ugenTick: function (input) {
      return this.data.delay.tick(input)
    }
  })

  return module;
});

define("chuck/libs/ugens", ["chuck/types", "chuck/audioContextService"], function (typesModule, audioContextService) {
  var ChuckType = typesModule.ChuckType,
    ChuckMethod = typesModule.ChuckMethod,
    FuncArg = typesModule.FuncArg,
    FunctionOverload = typesModule.FunctionOverload,
    float = typesModule.types.float,
    int = typesModule.types.int,
    UGen = typesModule.types.UGen,
    module = {},
    types = module.types = {}

  types.Impulse = new ChuckType("Impulse", UGen, {
    preConstructor: function () {
      var d = this.data = {}
      d.next = null
    },
    namespace: {
      next: new ChuckMethod("next", [new FunctionOverload([
          new FuncArg("value", float)],
        function (value) {
          return this.data.next = value
        })], "Impulse", float)
    },
    ugenTick: function () {
      var d = this.data
      if (d.next != null) {
        var out = d.next
        d.next = null
        return out
      }
      return 0
    }
  })

  function biQuadSetReson(d) {
    d.a2 = d.prad * d.prad
    d.a1 = -2.0 * d.prad * Math.cos(2.0 * Math.PI * d.pfreq / d.srate)

    if (d.norm) {
      // Use zeros at +- 1 and normalize the filter peak gain.
      d.b0 = 0.5 - 0.5 * d.a2
      d.b1 = -1.0
      d.b2 = -d.b0
    }
  }
  types.BiQuad = new ChuckType("BiQuad", UGen, {
    preConstructor: function () {
      var d = this.data = {}
      d.a0 = d.b0 = 1
      d.a1 = d.a2 = 0
      d.b1 = d.b2 = 0
      d.pfreq = d.zfreq = 0
      d.prad = d.zrad = 0
      d.srate = audioContextService.getSampleRate()
      d.norm = false
      d.input0 = d.input1 = d.input2 = d.output0 = d.output1 = d.output2 = 0
    },
    namespace: {
      prad: new ChuckMethod("prad", [new FunctionOverload([
          new FuncArg("value", float)],
        function (value) {
          var d = this.data
          d.prad = value
          biQuadSetReson(d)
          return d.prad
        })], "BiQuad", float),
      eqzs: new ChuckMethod("eqzs", [new FunctionOverload([
          new FuncArg("value", float)],
        function (value) {
          var d = this.data
          if (!value) {
            return value
          }

          d.b0 = 1.0
          d.b1 = 0.0
          d.b2 = -1.0
          return value
        })], "BiQuad", int),
      pfreq: new ChuckMethod("pfreq", [new FunctionOverload([
          new FuncArg("value", float)],
        function (value) {
          var d = this.data
          d.pfreq = value
          biQuadSetReson(d)
          return value
        })], "BiQuad", int)
    },
    ugenTick: function (input) {
      var d = this.data
      d.input0 = d.a0 * input
      d.output0 = d.b0 * d.input0 + d.b1 * d.input1 + d.b2 * d.input2
      d.output0 -= d.a2 * d.output2 + d.a1 * d.output1
      d.input2 = d.input1
      d.input1 = d.input0
      d.output2 = d.output1
      d.output1 = d.output0

      return d.output0
    }
  })

  types.Noise = new ChuckType("Noise", UGen, {
    ugenTick: function () {
      return -1 + 2*Math.random()
    }
  })

  return module
})
;
(function() {
  var __hasProp = {}.hasOwnProperty;

  define("chuck/scanner", ["chuck/nodes", "chuck/types", "chuck/instructions", "chuck/namespace", "chuck/logging", "chuck/libs/math", "chuck/libs/std", "chuck/libs/stk", "chuck/libs/ugens"], function(nodes, types, instructions, namespaceModule, logging, mathLib, stdLib, stkLib, ugensLib) {
    var ChuckCode, ChuckFrame, ChuckLocal, Instruction, Scanner, ScanningContext, module;
    module = {};
    Instruction = instructions.Instruction;
    ChuckLocal = (function() {
      function ChuckLocal(size, ri, name, isContextGlobal) {
        this.size = size;
        this.ri = ri;
        this.name = name;
        this.isContextGlobal = isContextGlobal;
      }

      return ChuckLocal;

    })();
    ChuckFrame = (function() {
      function ChuckFrame() {
        this.currentOffset = 0;
        this.stack = [];
      }

      return ChuckFrame;

    })();
    ChuckCode = (function() {
      function ChuckCode() {
        this.instructions = [];
        this.frame = new ChuckFrame();
        this._ri = 0;
        this.pushScope();
      }

      ChuckCode.prototype.allocRegister = function(value) {
        var ri;
        ri = ++this._ri;
        if (value != null) {
          value.ri = ri;
        }
        return ri;
      };

      ChuckCode.prototype.pushScope = function() {
        this.frame.stack.push(null);
      };

      ChuckCode.prototype.popScope = function() {
        while (this.frame.stack.length > 0 && (this.frame.stack[this.frame.stack.length - 1] != null)) {
          this.frame.stack.pop();
          --this.frame.currentOffset;
        }
        this.frame.stack.pop();
        logging.debug("After popping scope, current stack offset is " + this.frame.currentOffset);
      };

      ChuckCode.prototype.append = function(instruction) {
        this.instructions.push(instruction);
        return instruction;
      };

      ChuckCode.prototype.allocateLocal = function(type, value, isGlobal) {
        var local, ri, scopeStr;
        ri = this.allocRegister();
        local = new ChuckLocal(type.size, ri, value.name, isGlobal);
        scopeStr = isGlobal ? "global" : "function";
        logging.debug("Allocating local " + value.name + " of type " + type.name + " in register " + local.ri + " (scope: " + scopeStr + ")");
        this.frame.currentOffset += 1;
        this.frame.stack.push(local);
        value.ri = local.ri;
        return local;
      };

      ChuckCode.prototype.finish = function() {
        var local, locals, stack;
        stack = this.frame.stack;
        locals = [];
        while (stack.length > 0 && (stack[stack.length - 1] != null)) {
          local = stack.pop();
          if (local != null) {
            this.frame.currentOffset -= local.size;
            locals.push(local);
          }
        }
        stack.pop();
        return locals;
      };

      ChuckCode.prototype.getNextIndex = function() {
        return this.instructions.length;
      };

      return ChuckCode;

    })();
    ScanningContext = (function() {
      function ScanningContext() {
        var k, lib, type, typeType, value, _i, _len, _ref, _ref1;
        this.code = new ChuckCode();
        this._globalNamespace = new namespaceModule.Namespace("global");
        _ref = [types, mathLib, stdLib, stkLib, ugensLib];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          lib = _ref[_i];
          _ref1 = lib.types;
          for (k in _ref1) {
            if (!__hasProp.call(_ref1, k)) continue;
            type = _ref1[k];
            this._globalNamespace.addType(type);
            typeType = _.extend({}, types.Class);
            typeType.actualType = type;
            value = this._globalNamespace.addVariable(type.name, typeType, type);
            this.code.allocRegister(value);
          }
        }
        value = this._globalNamespace.addVariable("dac", types.types.Dac);
        this.code.allocRegister(value);
        value = this._globalNamespace.addVariable("blackhole", types.types.Bunghole);
        this.code.allocRegister(value);
        value = this._globalNamespace.addVariable("now", types.types.Time);
        this.code.allocRegister(value);
        value = this._globalNamespace.addVariable("me", types.types.shred);
        this.code.allocRegister(value);
        this._globalNamespace.commit();
        this._namespaceStack = [this._globalNamespace];
        this._currentNamespace = this._globalNamespace;
        this._breakStack = [];
        this._contStack = [];
        this._codeStack = [];
        this._isGlobal = true;
        this._functionLevel = 0;
      }

      /**
      Replace code object while storing the old one on the stack.
      */


      ScanningContext.prototype.pushCode = function(name) {
        this.enterFunctionScope();
        logging.debug("Pushing code object");
        this._codeStack.push(this.code);
        this.code = new ChuckCode();
        this.code.name = name;
        return this.code;
      };

      /**
      Restore code object at the top of the stack.
      */


      ScanningContext.prototype.popCode = function() {
        var toReturn;
        logging.debug("Popping code object");
        toReturn = this.code;
        this.code = this._codeStack.pop();
        this._isGlobal = this._codeStack.length === 0;
        if (this._isGlobal) {
          logging.debug("Back at global scope");
        }
        this.exitFunctionScope();
        return toReturn;
      };

      ScanningContext.prototype.enterFunctionScope = function() {
        ++this._functionLevel;
        this._isGlobal = false;
        this.enterScope();
      };

      ScanningContext.prototype.exitFunctionScope = function() {
        this.exitScope();
        --this._functionLevel;
        this._isGlobal = this._functionLevel <= 0;
      };

      ScanningContext.prototype.isInFunction = function() {
        return this._functionLevel > 0;
      };

      ScanningContext.prototype.findType = function(typeName) {
        var type;
        type = this._currentNamespace.findType(typeName);
        return type;
      };

      ScanningContext.prototype.findValue = function(name, climb) {
        var val;
        if (climb == null) {
          climb = false;
        }
        val = this._currentNamespace.findValue(name, climb);
        if (val != null) {
          return val;
        }
        return val = this._currentNamespace.findValue(name, true);
      };

      ScanningContext.prototype.addVariable = function(name, type) {
        return this._currentNamespace.addVariable(name, type, null, this._isGlobal);
      };

      ScanningContext.prototype.addConstant = function(name, type, value) {
        var scopeStr;
        scopeStr = this._isGlobal ? "global" : "function";
        logging.debug("Adding constant " + name + " (scope: " + scopeStr + ")");
        return this._currentNamespace.addConstant(name, type, value, this._isGlobal);
      };

      ScanningContext.prototype.addValue = function(value, name) {
        var scopeStr;
        scopeStr = this._isGlobal ? "global" : "function";
        if (name == null) {
          name = value.name;
        }
        logging.debug("Adding value " + name + " (scope: " + scopeStr + ")");
        return this._currentNamespace.addValue(value, name, this._isGlobal);
      };

      ScanningContext.prototype.createValue = function(type, name) {
        return new namespaceModule.ChuckValue(type, name, this._currentNamespace, this._isGlobal);
      };

      ScanningContext.prototype.pushToBreakStack = function(statement) {
        return this._breakStack.push(statement);
      };

      ScanningContext.prototype.pushToContStack = function(statement) {
        return this._contStack.push(statement);
      };

      ScanningContext.prototype.instantiateObject = function(type, ri) {
        logging.debug("Emitting instantiation of object of type " + type.name + " along with preconstructor");
        this.code.append(instructions.instantiateObject(type, ri));
        this._emitPreConstructor(type, ri);
      };

      /* Allocate new register.*/


      ScanningContext.prototype.allocRegister = function() {
        return this.code.allocRegister();
      };

      ScanningContext.prototype.allocateLocal = function(type, value, emit) {
        var local, scopeStr;
        if (emit == null) {
          emit = true;
        }
        scopeStr = this._isGlobal ? "global" : "function";
        logging.debug("Allocating local (scope: " + scopeStr + ")");
        local = this.code.allocateLocal(type, value, this._isGlobal);
        if (emit) {
          logging.debug("Emitting AllocWord instruction");
          this.code.append(new Instruction("InitValue", {
            r1: local.ri
          }));
        }
        return local;
      };

      ScanningContext.prototype.getNextIndex = function() {
        return this.code.getNextIndex();
      };

      ScanningContext.prototype.enterScope = function() {
        return this._currentNamespace.enterScope();
      };

      ScanningContext.prototype.exitScope = function() {
        return this._currentNamespace.exitScope();
      };

      ScanningContext.prototype.enterCodeScope = function() {
        logging.debug("Entering nested code scope");
        this.code.pushScope();
      };

      ScanningContext.prototype.exitCodeScope = function() {
        logging.debug("Exiting nested code scope");
        this.code.popScope();
      };

      ScanningContext.prototype.emitAssignment = function(type, varDecl) {
        var addConstructors, array, elemType, isObj, local, typesWithCtors, value;
        value = varDecl.value, array = varDecl.array;
        local = this.allocateLocal(type, value);
        if (array != null) {
          logging.debug("Emitting array indices");
          array.scanPass5(this);
          logging.debug("Emitting AllocateArray");
          this.code.append(instructions.allocateArray(type, array.ri, local.ri));
          elemType = type.arrayType;
          typesWithCtors = [];
          addConstructors = function(type) {
            if (type.parent != null) {
              addConstructors(type.parent);
            }
            if (type.hasConstructor) {
              return typesWithCtors.push(type);
            }
          };
          if (types.isObj(elemType)) {
            logging.debug("Emitting PreCtorArray");
            addConstructors(elemType);
            this.code.append(instructions.preCtorArray(elemType, array.ri, local.ri, typesWithCtors));
          }
        }
        isObj = types.isObj(type) || (array != null);
        if (isObj && (array == null) && !type.isRef) {
          this.instantiateObject(type, local.ri);
        }
        return local.ri;
      };

      ScanningContext.prototype.emitPlusAssign = function(r1, r2, r3) {
        this.code.append(instructions.plusAssign(r1, r2, r3));
      };

      ScanningContext.prototype.emitMinusAssign = function(r1, r2, r3) {
        this.code.append(instructions.minusAssign(r1, r2, r3));
      };

      ScanningContext.prototype.emitUGenLink = function(r1, r2) {
        this.code.append(instructions.uGenLink(r1, r2));
      };

      ScanningContext.prototype.emitUGenUnlink = function(r1, r2) {
        this.code.append(instructions.uGenUnlink(r1, r2));
      };

      ScanningContext.prototype.emitLoadConst = function(value) {
        var r1;
        r1 = this.allocRegister();
        this.code.append(new Instruction("LoadConst", {
          val: value,
          r1: r1
        }));
        return r1;
      };

      ScanningContext.prototype.emitLoadLocal = function(r1) {
        var r2;
        r2 = this.allocRegister();
        this.code.append(new Instruction("LoadLocal", {
          r1: r1,
          r2: r2
        }));
        return r2;
      };

      ScanningContext.prototype.emitFuncCallMember = function(r1, argRegisters, r3) {
        this.code.append(new Instruction("FuncCallMember", {
          r1: r1,
          argRegisters: argRegisters,
          r3: r3
        }));
      };

      ScanningContext.prototype.emitFuncCallStatic = function(r1, argRegisters, r3) {
        this.code.append(new Instruction("FuncCallStatic", {
          r1: r1,
          argRegisters: argRegisters,
          r3: r3
        }));
      };

      ScanningContext.prototype.emitFuncCall = function(r1, argRegisters, r3) {
        return this.code.append(instructions.funcCall(r1, argRegisters, r3));
      };

      ScanningContext.prototype.emitRegPushMemAddr = function(offset, isGlobal) {
        this.code.append(instructions.regPushMemAddr(offset, isGlobal));
      };

      ScanningContext.prototype.emitRegPushMem = function(offset, isGlobal) {
        this.code.append(instructions.regPushMem(offset, isGlobal));
      };

      ScanningContext.prototype.emitDotStaticFunc = function(func) {
        this.code.append(instructions.dotStaticFunc(func));
      };

      ScanningContext.prototype.emitDotMemberFunc = function(func, r1) {
        var r2;
        r2 = this.allocRegister();
        this.code.append(new Instruction("DotMemberFunc", {
          func: func,
          r1: r1,
          r2: r2
        }));
        return r2;
      };

      ScanningContext.prototype.emitTimesNumber = function(r1, r2, r3) {
        this.code.append(new Instruction("TimesNumber", {
          r1: r1,
          r2: r2,
          r3: r3
        }));
      };

      ScanningContext.prototype.emitDivideNumber = function(r1, r2, r3) {
        this.code.append(instructions.divideNumber(r1, r2, r3));
      };

      ScanningContext.prototype.emitRegPushMe = function() {
        this.code.append(instructions.regPushMe());
      };

      ScanningContext.prototype.emitAddNumber = function(r1, r2, r3) {
        this.code.append(new Instruction("AddNumber", {
          r1: r1,
          r2: r2,
          r3: r3
        }));
      };

      ScanningContext.prototype.emitPreIncNumber = function(r1, r2) {
        return this.code.append(instructions.preIncNumber(r1, r2));
      };

      ScanningContext.prototype.emitPostIncNumber = function(r1, r2) {
        return this.code.append(instructions.postIncNumber(r1, r2));
      };

      ScanningContext.prototype.emitSubtractNumber = function(r1, r2, r3) {
        this.code.append(instructions.subtractNumber(r1, r2, r3));
      };

      ScanningContext.prototype.emitTimesNumber = function(r1, r2, r3) {
        return this.code.append(new Instruction("TimesNumber", {
          r1: r1,
          r2: r2,
          r3: r3
        }));
      };

      ScanningContext.prototype.emitLtNumber = function(r1, r2, r3) {
        this.code.append(new Instruction("LtNumber", {
          r1: r1,
          r2: r2,
          r3: r3
        }));
      };

      ScanningContext.prototype.emitGtNumber = function(r1, r2, r3) {
        this.code.append(new Instruction("GtNumber", {
          r1: r1,
          r2: r2,
          r3: r3
        }));
      };

      ScanningContext.prototype.emitLeNumber = function(r1, r2, r3) {
        this.code.append(new Instruction("LeNumber", {
          r1: r1,
          r2: r2,
          r3: r3
        }));
      };

      ScanningContext.prototype.emitGeNumber = function(r1, r2, r3) {
        this.code.append(new Instruction("GeNumber", {
          r1: r1,
          r2: r2,
          r3: r3
        }));
      };

      ScanningContext.prototype.emitTimeAdvance = function(r1) {
        logging.debug("Emitting TimeAdvance of register " + r1);
        this.code.append(new Instruction("TimeAdvance", {
          r1: r1
        }));
      };

      ScanningContext.prototype.emitOpAtChuck = function(r1, r2, isArray) {
        if (isArray == null) {
          isArray = false;
        }
        logging.debug("Emitting AssignObject of register " + r1 + " to " + r2 + " (isArray: " + isArray + ")");
        this.code.append(instructions.assignObject(isArray, this._isGlobal, r1, r2));
      };

      ScanningContext.prototype.emitGack = function(types, registers) {
        this.code.append(instructions.gack(types, registers));
      };

      ScanningContext.prototype.emitBranchEq = function(r1, r2, jmp) {
        logging.debug("Emitting BranchEq of registers " + r1 + " and " + r2);
        return this.code.append(new Instruction("BranchEq", {
          r1: r1,
          r2: r2,
          jmp: jmp
        }));
      };

      ScanningContext.prototype.emitBranchIfFalse = function(r1) {
        logging.debug("Emitting BranchIfFalse of register " + r1);
        return this.code.append(new Instruction("BranchIfFalse", {
          r1: r1
        }));
      };

      ScanningContext.prototype.emitGoto = function(jmp) {
        return this.code.append(instructions.goto(jmp));
      };

      ScanningContext.prototype.emitBreak = function() {
        var instr;
        instr = instructions.goto();
        this.code.append(instr);
        return this._breakStack.push(instr);
      };

      ScanningContext.prototype.emitArrayAccess = function(type, r1, r2, r3, emitAddr) {
        return this.code.append(instructions.arrayAccess(type, r1, r2, r3, emitAddr));
      };

      ScanningContext.prototype.emitArrayInit = function(type, registers, ri) {
        return this.code.append(instructions.arrayInit(type, registers, ri));
      };

      ScanningContext.prototype.emitStoreConst = function(r1, value) {
        return this.code.append(new Instruction("StoreConst", {
          r1: r1,
          value: value
        }));
      };

      ScanningContext.prototype.emitFuncReturn = function() {
        return this.code.append(instructions.funcReturn());
      };

      ScanningContext.prototype.emitNegateNumber = function(r1, r2) {
        return this.code.append(instructions.negateNumber(r1, r2));
      };

      ScanningContext.prototype.emitLoadGlobal = function(r1, r2) {
        return this.code.append(new Instruction("LoadGlobal", {
          r1: r1,
          r2: r2
        }));
      };

      ScanningContext.prototype.evaluateBreaks = function() {
        var instr;
        while (this._breakStack.length) {
          instr = this._breakStack.pop();
          instr.jmp = this._nextIndex();
        }
      };

      ScanningContext.prototype.finishScanning = function() {
        this.code.finish();
        this.code.append(instructions.eoc());
      };

      ScanningContext.prototype.addFunction = function(funcDef) {
        var arg, args, func, funcArg, funcGroup, name, type, value, _i, _len, _ref;
        value = this.findValue(funcDef.name);
        if (value != null) {
          funcGroup = value.value;
          logging.debug("Found corresponding function group " + funcDef.name);
        } else {
          logging.debug("Creating function group " + funcDef.name);
          type = new types.ChuckType("[function]", types.types.Function);
          funcGroup = new types.ChuckFunction(funcDef.name, [], funcDef.retType);
          type.func = funcGroup;
          funcGroup.value = this.addConstant(funcGroup.name, type, funcGroup);
        }
        name = "" + funcDef.name + "@" + (funcGroup.getNumberOfOverloads()) + "@" + (this._currentNamespace.name || '');
        logging.debug("Adding function overload " + name);
        args = [];
        _ref = funcDef.args;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          arg = _ref[_i];
          funcArg = new types.FuncArg(arg.varDecl.name, arg.type);
          logging.debug("Adding function argument " + funcArg.name + " of type " + funcArg.type.name);
          args.push(funcArg);
        }
        func = new types.FunctionOverload(args, null, false, name);
        funcGroup.addOverload(func);
        func.value = this.addConstant(name, funcGroup.value.type, func);
        return func;
      };

      ScanningContext.prototype.getCurrentOffset = function() {
        return this.code.frame.currentOffset;
      };

      ScanningContext.prototype._emitPreConstructor = function(type, ri) {
        if (type.parent != null) {
          this._emitPreConstructor(type.parent, ri);
        }
        if (type.hasConstructor) {
          this.code.append(instructions.preConstructor(type, ri));
        }
      };

      ScanningContext.prototype._nextIndex = function() {
        return this.code.instructions.length;
      };

      return ScanningContext;

    })();
    Scanner = (function() {
      function Scanner(ast) {
        this._ast = ast;
        this._context = new ScanningContext();
        this._ri = 1;
      }

      Scanner.prototype.pass1 = function() {
        return this._pass(1);
      };

      Scanner.prototype.pass2 = function() {
        return this._pass(2);
      };

      Scanner.prototype.pass3 = function() {
        return this._pass(3);
      };

      Scanner.prototype.pass4 = function() {
        return this._pass(4);
      };

      Scanner.prototype.pass5 = function() {
        this._pass(5);
        this._context.finishScanning();
        return this.byteCode = this._context.code.instructions;
      };

      Scanner.prototype._pass = function(num) {
        var program;
        program = this._ast;
        return program["scanPass" + num](this._context);
      };

      return Scanner;

    })();
    module.scan = function(ast) {
      var scanner;
      scanner = new Scanner(ast);
      logging.debug("Scan pass 1");
      scanner.pass1();
      logging.debug("Scan pass 2");
      scanner.pass2();
      logging.debug("Scan pass 3");
      scanner.pass3();
      logging.debug("Scan pass 4");
      scanner.pass4();
      logging.debug("Scan pass 5");
      scanner.pass5();
      return scanner.byteCode;
    };
    return module;
  });

}).call(this);

(function() {
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  define("chuck/vm", ["chuck/logging", "chuck/types", "chuck/audioContextService", "chuck/ugen"], function(logging, types, audioContextService, ugenModule) {
    var Shred, Vm, callBuiltInFunction, compute, executeInstruction, logDebug, module;
    module = {};
    logDebug = function() {};
    callBuiltInFunction = function(vm, func, argRegisters, r3) {
      var args, retVal, thisObj;
      args = argRegisters.map(function(ri) {
        return vm.registers[ri];
      });
      if (func.isMember) {
        logDebug("Function is a method, passing 'this' to it");
        thisObj = args.shift();
      }
      logDebug("Calling function with arguments corresponding to registers " + argRegisters + ":", args);
      retVal = func.apply(thisObj, args);
      if (func.retType !== types["void"]) {
        logDebug("Registering return value:", retVal);
        vm.registers[r3] = retVal;
      }
    };
    executeInstruction = function(vm, instr) {
      var func, lhs, number, result, rhs, time, value;
      switch (instr.instructionName) {
        case "LoadConst":
          logDebug("LoadConst: Loading constant in register " + instr.r1 + ":", instr.val);
          vm.registers[instr.r1] = instr.val;
          break;
        case "LoadLocal":
          value = vm.registers[instr.r1];
          logDebug("LoadLocal: Loading local from register " + instr.r1 + " to register " + instr.r2 + ":", value);
          vm.registers[instr.r2] = value;
          break;
        case "LoadGlobal":
          value = vm.globalRegisters[instr.r1];
          logDebug("" + instr.instructionName + ": Loading global from register " + instr.r1 + " to register " + instr.r2 + ":", value);
          vm.registers[instr.r2] = value;
          break;
        case "FuncCallMember":
          func = vm.registers[instr.r1];
          logDebug("Calling instance method '" + func.name + "'");
          callBuiltInFunction(vm, func, instr.argRegisters, instr.r3);
          break;
        case "BranchEq":
          lhs = vm.registers[instr.r1];
          rhs = vm.registers[instr.r2];
          result = lhs === rhs;
          logDebug("Comparing " + lhs + " to " + rhs + ": " + result);
          if (result) {
            logDebug("Jumping to instruction number " + instr.jmp);
            vm.jumpTo(instr.jmp);
          } else {
            logDebug("Not jumping");
          }
          break;
        case "BranchIfFalse":
          logDebug("" + instr.instructionName + ": Checking if the value in register " + instr.r1 + " is false");
          value = vm.registers[instr.r1];
          if (!value) {
            logDebug("Jumping to instruction number " + instr.jmp);
            vm.jumpTo(instr.jmp);
          } else {
            logDebug("Not jumping");
          }
          break;
        case "DotMemberFunc":
          logDebug("" + instr.instructionName + ": Putting instance method in register " + instr.r2 + ":", instr.func);
          vm.registers[instr.r2] = instr.func;
          break;
        case "TimesNumber":
          lhs = vm.registers[instr.r1];
          rhs = vm.registers[instr.r2];
          number = lhs * rhs;
          logDebug("TimesNumber resulted in: " + number);
          vm.registers[instr.r3] = number;
          break;
        case "TimeAdvance":
          time = vm.registers[instr.r1];
          vm.suspendUntil(vm.globalRegisters[vm._nowRi] + time);
          break;
        case "AddNumber":
          lhs = vm.registers[instr.r1];
          rhs = vm.registers[instr.r2];
          number = lhs + rhs;
          logDebug("" + instr.instructionName + ": (" + lhs + " + " + rhs + ") resulted in: " + number);
          vm.registers[instr.r3] = number;
          break;
        case "LtNumber":
          lhs = vm.registers[instr.r1];
          rhs = vm.registers[instr.r2];
          result = lhs < rhs;
          logDebug("" + instr.instructionName + ": (" + lhs + " < " + rhs + ") resulted in: " + result);
          vm.registers[instr.r3] = result;
          break;
        case "GtNumber":
          lhs = vm.registers[instr.r1];
          rhs = vm.registers[instr.r2];
          result = lhs > rhs;
          logDebug("" + instr.instructionName + ": (" + lhs + " > " + rhs + ") resulted in: " + result);
          vm.registers[instr.r3] = result;
          break;
        case "LeNumber":
          lhs = vm.registers[instr.r1];
          rhs = vm.registers[instr.r2];
          result = lhs <= rhs;
          logDebug("" + instr.instructionName + ": (" + lhs + " <= " + rhs + ") resulted in: " + result);
          vm.registers[instr.r3] = result;
          break;
        case "GeNumber":
          lhs = vm.registers[instr.r1];
          rhs = vm.registers[instr.r2];
          result = lhs >= rhs;
          logDebug("" + instr.instructionName + ": (" + lhs + " >= " + rhs + ") resulted in: " + result);
          vm.registers[instr.r3] = result;
          break;
        case "FuncCallStatic":
          func = vm.registers[instr.r1];
          logDebug("Calling static method '" + func.name + "'");
          callBuiltInFunction(vm, func, instr.argRegisters, instr.r3);
          break;
        case "InitValue":
          logDebug("" + instr.instructionName + ": Initializing value at register " + instr.r1);
          vm.registers[instr.r1] = 0;
          break;
        case "StoreConst":
          logDebug("" + instr.instructionName + ": Storing constant value in register " + instr.r1 + ":", instr.value);
          vm.registers[instr.r1] = instr.value;
          break;
        default:
          return instr.execute(vm);
      }
    };
    compute = function(self) {
      var instr, sampleRate;
      if (self._pc === 0) {
        logDebug("VM executing");
      } else {
        logDebug("Resuming VM execution");
      }
      while (self._pc < self.instructions.length && self._isRunning()) {
        instr = self.instructions[self._pc];
        logDebug("Executing instruction no. " + self._pc + ": " + instr.instructionName);
        executeInstruction(self, instr);
        self._pc = self._nextPc;
        ++self._nextPc;
      }
      if ((self._wakeTime != null) && !self._shouldStop) {
        sampleRate = audioContextService.getSampleRate();
        logDebug("Halting VM execution for " + ((self._wakeTime - self.globalRegisters[self._nowRi]) / sampleRate) + " second(s)");
        return true;
      } else {
        logDebug("VM execution has ended after " + self._nowSystem + " samples:", self._shouldStop);
        self._shouldStop = true;
        return false;
      }
    };
    Shred = (function() {
      function Shred(args) {
        this.args = args || [];
      }

      return Shred;

    })();
    module.Vm = Vm = (function() {
      function Vm(args) {
        this.stop = __bind(this.stop, this);
        this.regStack = [];
        this.memStack = [];
        this._funcMemStacks = [];
        this._dac = new ugenModule.Dac();
        this._bunghole = new ugenModule.Bunghole();
        this.registers = this.globalRegisters = [];
        this.globalRegisters[30] = this._dac;
        this.globalRegisters[31] = this._bunghole;
        this._registersStack = [this.globalRegisters];
        this.instructionsStack = [];
        this.instructions = null;
        this.isExecuting = false;
        this._ugens = [];
        this._wakeTime = void 0;
        this._pc = 0;
        this._nextPc = 1;
        this._shouldStop = false;
        this._nowRi = 32;
        this.globalRegisters[this._nowRi] = 0;
        this._me = this.globalRegisters[33] = new Shred(args);
        this._nowSystem = 0;
        this._gain = 1;
      }

      Vm.prototype.execute = function(byteCode) {
        var deferred,
          _this = this;
        this._pc = 0;
        this.isExecuting = true;
        this.instructions = byteCode;
        this.instructionsStack = [];
        deferred = Q.defer();
        setTimeout(function() {
          if (!compute(_this)) {
            logDebug("Ending VM execution");
            _this._terminateProcessing();
            deferred.resolve();
            return;
          }
          logDebug("Starting audio processing");
          _this._scriptProcessor = audioContextService.createScriptProcessor();
          return _this._scriptProcessor.onaudioprocess = function(event) {
            var error;
            try {
              _this._processAudio(event, deferred);
            } catch (_error) {
              error = _error;
              _this._terminateProcessing();
              deferred.reject("Caught exception in audio processing callback after " + _this._nowSystem + " samples: " + error);
            }
          };
        }, 0);
        return deferred.promise;
      };

      Vm.prototype.stop = function() {
        logDebug("Stopping VM");
        this._shouldStop = true;
      };

      Vm.prototype.addUgen = function(ugen) {
        this._ugens.push(ugen);
      };

      Vm.prototype.pushToReg = function(value) {
        if (value == null) {
          throw new Error('pushToReg: value is undefined');
        }
        this.regStack.push(value);
      };

      Vm.prototype.pushMemAddrToReg = function(offset, isGlobal) {
        var scopeStr, value;
        value = this._getMemStack(isGlobal)[offset];
        scopeStr = isGlobal ? "global" : "function";
        logDebug("Pushing memory stack address " + offset + " (scope: " + scopeStr + ") to regular stack:", value);
        return this.regStack.push(offset);
      };

      Vm.prototype.insertIntoMemory = function(index, value, isGlobal) {
        var scopeStr;
        scopeStr = isGlobal ? "global" : "function";
        logDebug("Inserting value " + value + " (" + (typeof value) + ") into memory stack at index " + index + " (scope: " + scopeStr + ")");
        this._getMemStack(isGlobal)[index] = value;
      };

      Vm.prototype.removeFromMemory = function(index, isGlobal) {
        logDebug("Removing element " + index + " of memory stack");
        this._getMemStack(isGlobal).splice(index, 1);
      };

      Vm.prototype.getFromMemory = function(index, isGlobal) {
        var memStack, scopeStr, val;
        memStack = this._getMemStack(isGlobal);
        val = memStack[index];
        scopeStr = isGlobal ? "global" : "function";
        logDebug("Getting value from memory stack at index " + index + " (scope: " + scopeStr + "):", val);
        return val;
      };

      Vm.prototype.suspendUntil = function(time) {
        logDebug("Suspending VM execution until " + time + " (now: " + this.globalRegisters[this._nowRi] + ")");
        this._wakeTime = time;
      };

      Vm.prototype.jumpTo = function(jmp) {
        this._nextPc = jmp;
      };

      Vm.prototype.enterFunctionScope = function() {
        logDebug("Entering new function scope");
        this._funcMemStacks.push([]);
        this.registers = [];
        return this._registersStack.push(this.registers);
      };

      Vm.prototype.exitFunctionScope = function() {
        logDebug("Exiting current function scope");
        this._funcMemStacks.pop();
        this._registersStack.pop();
        return this.registers = this._registersStack[this._registersStack.length - 1];
      };

      Vm.prototype._terminateProcessing = function() {
        logDebug("Terminating processing");
        this._dac.stop();
        if (this._scriptProcessor != null) {
          this._scriptProcessor.disconnect(0);
          this._scriptProcessor = void 0;
        }
        return this.isExecuting = false;
      };

      /** Get the memory stack for the requested scope (global/function)
      */


      Vm.prototype._getMemStack = function(isGlobal) {
        if (isGlobal == null) {
          throw new Error('isGlobal must be specified');
        }
        if (isGlobal) {
          return this.memStack;
        } else {
          return this._funcMemStacks[this._funcMemStacks.length - 1];
        }
      };

      Vm.prototype._isRunning = function() {
        return (this._wakeTime == null) && !this._shouldStop;
      };

      Vm.prototype._processAudio = function(event, deferred) {
        var frame, i, now, samplesLeft, samplesRight, _i, _j, _ref, _ref1;
        samplesLeft = event.outputBuffer.getChannelData(0);
        samplesRight = event.outputBuffer.getChannelData(1);
        if (this._shouldStop) {
          logDebug("Audio callback finishing execution after processing " + this._nowSystem + " samples");
          for (i = _i = 0, _ref = event.outputBuffer.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
            samplesLeft[i] = 0;
            samplesRight[i] = 0;
          }
          this._terminateProcessing();
          deferred.resolve();
          return;
        }
        logDebug("Audio callback processing " + event.outputBuffer.length + " samples");
        for (i = _j = 0, _ref1 = event.outputBuffer.length; 0 <= _ref1 ? _j < _ref1 : _j > _ref1; i = 0 <= _ref1 ? ++_j : --_j) {
          if (this._wakeTime <= (this._nowSystem + 0.5)) {
            now = this.globalRegisters[this._nowRi] = this._wakeTime;
            this._wakeTime = void 0;
            logDebug("Letting VM compute sample, now: " + now);
            compute(this);
          }
          ++this._nowSystem;
          frame = [0, 0];
          if (!this._shouldStop) {
            this._dac.tick(this._nowSystem, frame);
            this._bunghole.tick(this._nowSystem);
          }
          samplesLeft[i] = frame[0] * this._gain;
          samplesRight[i] = frame[1] * this._gain;
        }
        if (this._shouldStop) {
          logDebug("Audio callback: In the process of stopping, flushing buffers");
        }
        logDebug("Audio callback finished processing, currently at " + this._nowSystem + " samples in total");
      };

      return Vm;

    })();
    return module;
  });

}).call(this);

(function() {
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  define("chuck", ["chuck/parserService", "chuck/scanner", "chuck/vm", "chuck/logging", "chuck/audioContextService"], function(parserService, scanner, vmModule, logging, audioContextService) {
    var module;
    module = {};
    module.Chuck = (function() {
      function _Class(audioContext, audioDestination) {
        this.audioContext = audioContext != null ? audioContext : null;
        this.audioDestination = audioDestination != null ? audioDestination : null;
        this.isExecuting = __bind(this.isExecuting, this);
        this.stop = __bind(this.stop, this);
        this.execute = __bind(this.execute, this);
      }

      _Class.prototype.execute = function(sourceCode, args) {
        var ast, byteCode;
        audioContextService.prepareForExecution(this.audioContext, this.audioDestination);
        ast = parserService.parse(sourceCode);
        byteCode = scanner.scan(ast);
        this._vm = new vmModule.Vm(args);
        return this._vm.execute(byteCode);
      };

      _Class.prototype.stop = function() {
        var deferred;
        if (!this.isExecuting()) {
          deferred = Q.defer();
          deferred.resolve();
          deferred.promise;
        }
        this._vm.stop();
        return audioContextService.stopOperation();
      };

      _Class.prototype.isExecuting = function() {
        if (this._vm == null) {
          return;
        }
        return this._vm.isExecuting;
      };

      return _Class;

    })();
    module.setLogger = function(logger) {
      return logging.setLogger(logger);
    };
    return module;
  });

}).call(this);

/**
 * @license
 * Lo-Dash 2.3.0 <http://lodash.com/>
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
;(function() {

  /** Used as a safe reference for `undefined` in pre ES5 environments */
  var undefined;

  /** Used to pool arrays and objects used internally */
  var arrayPool = [],
      objectPool = [];

  /** Used to generate unique IDs */
  var idCounter = 0;

  /** Used internally to indicate various things */
  var indicatorObject = {};

  /** Used to prefix keys to avoid issues with `__proto__` and properties on `Object.prototype` */
  var keyPrefix = +new Date + '';

  /** Used as the size when optimizations are enabled for large arrays */
  var largeArraySize = 75;

  /** Used as the max size of the `arrayPool` and `objectPool` */
  var maxPoolSize = 40;

  /** Used to detect and test whitespace */
  var whitespace = (
    // whitespace
    ' \t\x0B\f\xA0\ufeff' +

    // line terminators
    '\n\r\u2028\u2029' +

    // unicode category "Zs" space separators
    '\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000'
  );

  /** Used to match empty string literals in compiled template source */
  var reEmptyStringLeading = /\b__p \+= '';/g,
      reEmptyStringMiddle = /\b(__p \+=) '' \+/g,
      reEmptyStringTrailing = /(__e\(.*?\)|\b__t\)) \+\n'';/g;

  /**
   * Used to match ES6 template delimiters
   * http://people.mozilla.org/~jorendorff/es6-draft.html#sec-7.8.6
   */
  var reEsTemplate = /\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g;

  /** Used to match regexp flags from their coerced string values */
  var reFlags = /\w*$/;

  /** Used to detected named functions */
  var reFuncName = /^\s*function[ \n\r\t]+\w/;

  /** Used to match "interpolate" template delimiters */
  var reInterpolate = /<%=([\s\S]+?)%>/g;

  /** Used to match leading whitespace and zeros to be removed */
  var reLeadingSpacesAndZeros = RegExp('^[' + whitespace + ']*0+(?=.$)');

  /** Used to ensure capturing order of template delimiters */
  var reNoMatch = /($^)/;

  /** Used to detect functions containing a `this` reference */
  var reThis = /\bthis\b/;

  /** Used to match unescaped characters in compiled string literals */
  var reUnescapedString = /['\n\r\t\u2028\u2029\\]/g;

  /** Used to assign default `context` object properties */
  var contextProps = [
    'Array', 'Boolean', 'Date', 'Error', 'Function', 'Math', 'Number', 'Object',
    'RegExp', 'String', '_', 'attachEvent', 'clearTimeout', 'isFinite', 'isNaN',
    'parseInt', 'setImmediate', 'setTimeout'
  ];

  /** Used to fix the JScript [[DontEnum]] bug */
  var shadowedProps = [
    'constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
    'toLocaleString', 'toString', 'valueOf'
  ];

  /** Used to make template sourceURLs easier to identify */
  var templateCounter = 0;

  /** `Object#toString` result shortcuts */
  var argsClass = '[object Arguments]',
      arrayClass = '[object Array]',
      boolClass = '[object Boolean]',
      dateClass = '[object Date]',
      errorClass = '[object Error]',
      funcClass = '[object Function]',
      numberClass = '[object Number]',
      objectClass = '[object Object]',
      regexpClass = '[object RegExp]',
      stringClass = '[object String]';

  /** Used to identify object classifications that `_.clone` supports */
  var cloneableClasses = {};
  cloneableClasses[funcClass] = false;
  cloneableClasses[argsClass] = cloneableClasses[arrayClass] =
  cloneableClasses[boolClass] = cloneableClasses[dateClass] =
  cloneableClasses[numberClass] = cloneableClasses[objectClass] =
  cloneableClasses[regexpClass] = cloneableClasses[stringClass] = true;

  /** Used as an internal `_.debounce` options object */
  var debounceOptions = {
    'leading': false,
    'maxWait': 0,
    'trailing': false
  };

  /** Used as the property descriptor for `__bindData__` */
  var descriptor = {
    'configurable': false,
    'enumerable': false,
    'value': null,
    'writable': false
  };

  /** Used as the data object for `iteratorTemplate` */
  var iteratorData = {
    'args': '',
    'array': null,
    'bottom': '',
    'firstArg': '',
    'init': '',
    'keys': null,
    'loop': '',
    'shadowedProps': null,
    'support': null,
    'top': '',
    'useHas': false
  };

  /** Used to determine if values are of the language type Object */
  var objectTypes = {
    'boolean': false,
    'function': true,
    'object': true,
    'number': false,
    'string': false,
    'undefined': false
  };

  /** Used to escape characters for inclusion in compiled string literals */
  var stringEscapes = {
    '\\': '\\',
    "'": "'",
    '\n': 'n',
    '\r': 'r',
    '\t': 't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  /** Used as a reference to the global object */
  var root = (objectTypes[typeof window] && window) || this;

  /** Detect free variable `exports` */
  var freeExports = objectTypes[typeof exports] && exports && !exports.nodeType && exports;

  /** Detect free variable `module` */
  var freeModule = objectTypes[typeof module] && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports` */
  var moduleExports = freeModule && freeModule.exports === freeExports && freeExports;

  /** Detect free variable `global` from Node.js or Browserified code and use it as `root` */
  var freeGlobal = objectTypes[typeof global] && global;
  if (freeGlobal && (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal)) {
    root = freeGlobal;
  }

  /*--------------------------------------------------------------------------*/

  /**
   * The base implementation of `_.indexOf` without support for binary searches
   * or `fromIndex` constraints.
   *
   * @private
   * @param {Array} array The array to search.
   * @param {*} value The value to search for.
   * @param {number} [fromIndex=0] The index to search from.
   * @returns {number} Returns the index of the matched value or `-1`.
   */
  function baseIndexOf(array, value, fromIndex) {
    var index = (fromIndex || 0) - 1,
        length = array ? array.length : 0;

    while (++index < length) {
      if (array[index] === value) {
        return index;
      }
    }
    return -1;
  }

  /**
   * An implementation of `_.contains` for cache objects that mimics the return
   * signature of `_.indexOf` by returning `0` if the value is found, else `-1`.
   *
   * @private
   * @param {Object} cache The cache object to inspect.
   * @param {*} value The value to search for.
   * @returns {number} Returns `0` if `value` is found, else `-1`.
   */
  function cacheIndexOf(cache, value) {
    var type = typeof value;
    cache = cache.cache;

    if (type == 'boolean' || value == null) {
      return cache[value] ? 0 : -1;
    }
    if (type != 'number' && type != 'string') {
      type = 'object';
    }
    var key = type == 'number' ? value : keyPrefix + value;
    cache = (cache = cache[type]) && cache[key];

    return type == 'object'
      ? (cache && baseIndexOf(cache, value) > -1 ? 0 : -1)
      : (cache ? 0 : -1);
  }

  /**
   * Adds a given value to the corresponding cache object.
   *
   * @private
   * @param {*} value The value to add to the cache.
   */
  function cachePush(value) {
    var cache = this.cache,
        type = typeof value;

    if (type == 'boolean' || value == null) {
      cache[value] = true;
    } else {
      if (type != 'number' && type != 'string') {
        type = 'object';
      }
      var key = type == 'number' ? value : keyPrefix + value,
          typeCache = cache[type] || (cache[type] = {});

      if (type == 'object') {
        (typeCache[key] || (typeCache[key] = [])).push(value);
      } else {
        typeCache[key] = true;
      }
    }
  }

  /**
   * Used by `_.max` and `_.min` as the default callback when a given
   * collection is a string value.
   *
   * @private
   * @param {string} value The character to inspect.
   * @returns {number} Returns the code unit of given character.
   */
  function charAtCallback(value) {
    return value.charCodeAt(0);
  }

  /**
   * Used by `sortBy` to compare transformed `collection` elements, stable sorting
   * them in ascending order.
   *
   * @private
   * @param {Object} a The object to compare to `b`.
   * @param {Object} b The object to compare to `a`.
   * @returns {number} Returns the sort order indicator of `1` or `-1`.
   */
  function compareAscending(a, b) {
    var ac = a.criteria,
        bc = b.criteria;

    // ensure a stable sort in V8 and other engines
    // http://code.google.com/p/v8/issues/detail?id=90
    if (ac !== bc) {
      if (ac > bc || typeof ac == 'undefined') {
        return 1;
      }
      if (ac < bc || typeof bc == 'undefined') {
        return -1;
      }
    }
    // The JS engine embedded in Adobe applications like InDesign has a buggy
    // `Array#sort` implementation that causes it, under certain circumstances,
    // to return the same value for `a` and `b`.
    // See https://github.com/jashkenas/underscore/pull/1247
    return a.index - b.index;
  }

  /**
   * Creates a cache object to optimize linear searches of large arrays.
   *
   * @private
   * @param {Array} [array=[]] The array to search.
   * @returns {null|Object} Returns the cache object or `null` if caching should not be used.
   */
  function createCache(array) {
    var index = -1,
        length = array.length,
        first = array[0],
        mid = array[(length / 2) | 0],
        last = array[length - 1];

    if (first && typeof first == 'object' &&
        mid && typeof mid == 'object' && last && typeof last == 'object') {
      return false;
    }
    var cache = getObject();
    cache['false'] = cache['null'] = cache['true'] = cache['undefined'] = false;

    var result = getObject();
    result.array = array;
    result.cache = cache;
    result.push = cachePush;

    while (++index < length) {
      result.push(array[index]);
    }
    return result;
  }

  /**
   * Used by `template` to escape characters for inclusion in compiled
   * string literals.
   *
   * @private
   * @param {string} match The matched character to escape.
   * @returns {string} Returns the escaped character.
   */
  function escapeStringChar(match) {
    return '\\' + stringEscapes[match];
  }

  /**
   * Gets an array from the array pool or creates a new one if the pool is empty.
   *
   * @private
   * @returns {Array} The array from the pool.
   */
  function getArray() {
    return arrayPool.pop() || [];
  }

  /**
   * Gets an object from the object pool or creates a new one if the pool is empty.
   *
   * @private
   * @returns {Object} The object from the pool.
   */
  function getObject() {
    return objectPool.pop() || {
      'array': null,
      'cache': null,
      'criteria': null,
      'false': false,
      'index': 0,
      'null': false,
      'number': null,
      'object': null,
      'push': null,
      'string': null,
      'true': false,
      'undefined': false,
      'value': null
    };
  }

  /**
   * Checks if `value` is a DOM node in IE < 9.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if the `value` is a DOM node, else `false`.
   */
  function isNode(value) {
    // IE < 9 presents DOM nodes as `Object` objects except they have `toString`
    // methods that are `typeof` "string" and still can coerce nodes to strings
    return typeof value.toString != 'function' && typeof (value + '') == 'string';
  }

  /**
   * Releases the given array back to the array pool.
   *
   * @private
   * @param {Array} [array] The array to release.
   */
  function releaseArray(array) {
    array.length = 0;
    if (arrayPool.length < maxPoolSize) {
      arrayPool.push(array);
    }
  }

  /**
   * Releases the given object back to the object pool.
   *
   * @private
   * @param {Object} [object] The object to release.
   */
  function releaseObject(object) {
    var cache = object.cache;
    if (cache) {
      releaseObject(cache);
    }
    object.array = object.cache = object.criteria = object.object = object.number = object.string = object.value = null;
    if (objectPool.length < maxPoolSize) {
      objectPool.push(object);
    }
  }

  /**
   * Slices the `collection` from the `start` index up to, but not including,
   * the `end` index.
   *
   * Note: This function is used instead of `Array#slice` to support node lists
   * in IE < 9 and to ensure dense arrays are returned.
   *
   * @private
   * @param {Array|Object|string} collection The collection to slice.
   * @param {number} start The start index.
   * @param {number} end The end index.
   * @returns {Array} Returns the new array.
   */
  function slice(array, start, end) {
    start || (start = 0);
    if (typeof end == 'undefined') {
      end = array ? array.length : 0;
    }
    var index = -1,
        length = end - start || 0,
        result = Array(length < 0 ? 0 : length);

    while (++index < length) {
      result[index] = array[start + index];
    }
    return result;
  }

  /*--------------------------------------------------------------------------*/

  /**
   * Create a new `lodash` function using the given context object.
   *
   * @static
   * @memberOf _
   * @category Utilities
   * @param {Object} [context=root] The context object.
   * @returns {Function} Returns the `lodash` function.
   */
  function runInContext(context) {
    // Avoid issues with some ES3 environments that attempt to use values, named
    // after built-in constructors like `Object`, for the creation of literals.
    // ES5 clears this up by stating that literals must use built-in constructors.
    // See http://es5.github.io/#x11.1.5.
    context = context ? _.defaults(root.Object(), context, _.pick(root, contextProps)) : root;

    /** Native constructor references */
    var Array = context.Array,
        Boolean = context.Boolean,
        Date = context.Date,
        Error = context.Error,
        Function = context.Function,
        Math = context.Math,
        Number = context.Number,
        Object = context.Object,
        RegExp = context.RegExp,
        String = context.String,
        TypeError = context.TypeError;

    /**
     * Used for `Array` method references.
     *
     * Normally `Array.prototype` would suffice, however, using an array literal
     * avoids issues in Narwhal.
     */
    var arrayRef = [];

    /** Used for native method references */
    var errorProto = Error.prototype,
        objectProto = Object.prototype,
        stringProto = String.prototype;

    /** Used to restore the original `_` reference in `noConflict` */
    var oldDash = context._;

    /** Used to resolve the internal [[Class]] of values */
    var toString = objectProto.toString;

    /** Used to detect if a method is native */
    var reNative = RegExp('^' +
      String(toString)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/toString| for [^\]]+/g, '.*?') + '$'
    );

    /** Native method shortcuts */
    var ceil = Math.ceil,
        clearTimeout = context.clearTimeout,
        floor = Math.floor,
        fnToString = Function.prototype.toString,
        getPrototypeOf = reNative.test(getPrototypeOf = Object.getPrototypeOf) && getPrototypeOf,
        hasOwnProperty = objectProto.hasOwnProperty,
        now = reNative.test(now = Date.now) && now || function() { return +new Date; },
        push = arrayRef.push,
        propertyIsEnumerable = objectProto.propertyIsEnumerable,
        setTimeout = context.setTimeout,
        splice = arrayRef.splice,
        unshift = arrayRef.unshift;

    /** Used to detect `setImmediate` in Node.js */
    var setImmediate = typeof (setImmediate = freeGlobal && moduleExports && freeGlobal.setImmediate) == 'function' &&
      !reNative.test(setImmediate) && setImmediate;

    /** Used to set meta data on functions */
    var defineProperty = (function() {
      // IE 8 only accepts DOM elements
      try {
        var o = {},
            func = reNative.test(func = Object.defineProperty) && func,
            result = func(o, o, o) && func;
      } catch(e) { }
      return result;
    }());

    /* Native method shortcuts for methods with the same name as other `lodash` methods */
    var nativeCreate = reNative.test(nativeCreate = Object.create) && nativeCreate,
        nativeIsArray = reNative.test(nativeIsArray = Array.isArray) && nativeIsArray,
        nativeIsFinite = context.isFinite,
        nativeIsNaN = context.isNaN,
        nativeKeys = reNative.test(nativeKeys = Object.keys) && nativeKeys,
        nativeMax = Math.max,
        nativeMin = Math.min,
        nativeParseInt = context.parseInt,
        nativeRandom = Math.random;

    /** Used to lookup a built-in constructor by [[Class]] */
    var ctorByClass = {};
    ctorByClass[arrayClass] = Array;
    ctorByClass[boolClass] = Boolean;
    ctorByClass[dateClass] = Date;
    ctorByClass[funcClass] = Function;
    ctorByClass[objectClass] = Object;
    ctorByClass[numberClass] = Number;
    ctorByClass[regexpClass] = RegExp;
    ctorByClass[stringClass] = String;

    /** Used to avoid iterating non-enumerable properties in IE < 9 */
    var nonEnumProps = {};
    nonEnumProps[arrayClass] = nonEnumProps[dateClass] = nonEnumProps[numberClass] = { 'constructor': true, 'toLocaleString': true, 'toString': true, 'valueOf': true };
    nonEnumProps[boolClass] = nonEnumProps[stringClass] = { 'constructor': true, 'toString': true, 'valueOf': true };
    nonEnumProps[errorClass] = nonEnumProps[funcClass] = nonEnumProps[regexpClass] = { 'constructor': true, 'toString': true };
    nonEnumProps[objectClass] = { 'constructor': true };

    (function() {
      var length = shadowedProps.length;
      while (length--) {
        var key = shadowedProps[length];
        for (var className in nonEnumProps) {
          if (hasOwnProperty.call(nonEnumProps, className) && !hasOwnProperty.call(nonEnumProps[className], key)) {
            nonEnumProps[className][key] = false;
          }
        }
      }
    }());

    /*--------------------------------------------------------------------------*/

    /**
     * Creates a `lodash` object which wraps the given value to enable intuitive
     * method chaining.
     *
     * In addition to Lo-Dash methods, wrappers also have the following `Array` methods:
     * `concat`, `join`, `pop`, `push`, `reverse`, `shift`, `slice`, `sort`, `splice`,
     * and `unshift`
     *
     * Chaining is supported in custom builds as long as the `value` method is
     * implicitly or explicitly included in the build.
     *
     * The chainable wrapper functions are:
     * `after`, `assign`, `bind`, `bindAll`, `bindKey`, `chain`, `compact`,
     * `compose`, `concat`, `countBy`, `create`, `createCallback`, `curry`,
     * `debounce`, `defaults`, `defer`, `delay`, `difference`, `filter`, `flatten`,
     * `forEach`, `forEachRight`, `forIn`, `forInRight`, `forOwn`, `forOwnRight`,
     * `functions`, `groupBy`, `indexBy`, `initial`, `intersection`, `invert`,
     * `invoke`, `keys`, `map`, `max`, `memoize`, `merge`, `min`, `object`, `omit`,
     * `once`, `pairs`, `partial`, `partialRight`, `pick`, `pluck`, `pull`, `push`,
     * `range`, `reject`, `remove`, `rest`, `reverse`, `shuffle`, `slice`, `sort`,
     * `sortBy`, `splice`, `tap`, `throttle`, `times`, `toArray`, `transform`,
     * `union`, `uniq`, `unshift`, `unzip`, `values`, `where`, `without`, `wrap`,
     * and `zip`
     *
     * The non-chainable wrapper functions are:
     * `clone`, `cloneDeep`, `contains`, `escape`, `every`, `find`, `findIndex`,
     * `findKey`, `findLast`, `findLastIndex`, `findLastKey`, `has`, `identity`,
     * `indexOf`, `isArguments`, `isArray`, `isBoolean`, `isDate`, `isElement`,
     * `isEmpty`, `isEqual`, `isFinite`, `isFunction`, `isNaN`, `isNull`, `isNumber`,
     * `isObject`, `isPlainObject`, `isRegExp`, `isString`, `isUndefined`, `join`,
     * `lastIndexOf`, `mixin`, `noConflict`, `parseInt`, `pop`, `random`, `reduce`,
     * `reduceRight`, `result`, `shift`, `size`, `some`, `sortedIndex`, `runInContext`,
     * `template`, `unescape`, `uniqueId`, and `value`
     *
     * The wrapper functions `first` and `last` return wrapped values when `n` is
     * provided, otherwise they return unwrapped values.
     *
     * Explicit chaining can be enabled by using the `_.chain` method.
     *
     * @name _
     * @constructor
     * @category Chaining
     * @param {*} value The value to wrap in a `lodash` instance.
     * @returns {Object} Returns a `lodash` instance.
     * @example
     *
     * var wrapped = _([1, 2, 3]);
     *
     * // returns an unwrapped value
     * wrapped.reduce(function(sum, num) {
     *   return sum + num;
     * });
     * // => 6
     *
     * // returns a wrapped value
     * var squares = wrapped.map(function(num) {
     *   return num * num;
     * });
     *
     * _.isArray(squares);
     * // => false
     *
     * _.isArray(squares.value());
     * // => true
     */
    function lodash(value) {
      // don't wrap if already wrapped, even if wrapped by a different `lodash` constructor
      return (value && typeof value == 'object' && !isArray(value) && hasOwnProperty.call(value, '__wrapped__'))
       ? value
       : new lodashWrapper(value);
    }

    /**
     * A fast path for creating `lodash` wrapper objects.
     *
     * @private
     * @param {*} value The value to wrap in a `lodash` instance.
     * @param {boolean} chainAll A flag to enable chaining for all methods
     * @returns {Object} Returns a `lodash` instance.
     */
    function lodashWrapper(value, chainAll) {
      this.__chain__ = !!chainAll;
      this.__wrapped__ = value;
    }
    // ensure `new lodashWrapper` is an instance of `lodash`
    lodashWrapper.prototype = lodash.prototype;

    /**
     * An object used to flag environments features.
     *
     * @static
     * @memberOf _
     * @type Object
     */
    var support = lodash.support = {};

    (function() {
      var ctor = function() { this.x = 1; },
          object = { '0': 1, 'length': 1 },
          props = [];

      ctor.prototype = { 'valueOf': 1, 'y': 1 };
      for (var key in new ctor) { props.push(key); }
      for (key in arguments) { }

      /**
       * Detect if an `arguments` object's [[Class]] is resolvable (all but Firefox < 4, IE < 9).
       *
       * @memberOf _.support
       * @type boolean
       */
      support.argsClass = toString.call(arguments) == argsClass;

      /**
       * Detect if `arguments` objects are `Object` objects (all but Narwhal and Opera < 10.5).
       *
       * @memberOf _.support
       * @type boolean
       */
      support.argsObject = arguments.constructor == Object && !(arguments instanceof Array);

      /**
       * Detect if `name` or `message` properties of `Error.prototype` are
       * enumerable by default. (IE < 9, Safari < 5.1)
       *
       * @memberOf _.support
       * @type boolean
       */
      support.enumErrorProps = propertyIsEnumerable.call(errorProto, 'message') || propertyIsEnumerable.call(errorProto, 'name');

      /**
       * Detect if `prototype` properties are enumerable by default.
       *
       * Firefox < 3.6, Opera > 9.50 - Opera < 11.60, and Safari < 5.1
       * (if the prototype or a property on the prototype has been set)
       * incorrectly sets a function's `prototype` property [[Enumerable]]
       * value to `true`.
       *
       * @memberOf _.support
       * @type boolean
       */
      support.enumPrototypes = propertyIsEnumerable.call(ctor, 'prototype');

      /**
       * Detect if functions can be decompiled by `Function#toString`
       * (all but PS3 and older Opera mobile browsers & avoided in Windows 8 apps).
       *
       * @memberOf _.support
       * @type boolean
       */
      support.funcDecomp = !reNative.test(context.WinRTError) && reThis.test(runInContext);

      /**
       * Detect if `Function#name` is supported (all but IE).
       *
       * @memberOf _.support
       * @type boolean
       */
      support.funcNames = typeof Function.name == 'string';

      /**
       * Detect if `arguments` object indexes are non-enumerable
       * (Firefox < 4, IE < 9, PhantomJS, Safari < 5.1).
       *
       * @memberOf _.support
       * @type boolean
       */
      support.nonEnumArgs = key != 0;

      /**
       * Detect if properties shadowing those on `Object.prototype` are non-enumerable.
       *
       * In IE < 9 an objects own properties, shadowing non-enumerable ones, are
       * made non-enumerable as well (a.k.a the JScript [[DontEnum]] bug).
       *
       * @memberOf _.support
       * @type boolean
       */
      support.nonEnumShadows = !/valueOf/.test(props);

      /**
       * Detect if own properties are iterated after inherited properties (all but IE < 9).
       *
       * @memberOf _.support
       * @type boolean
       */
      support.ownLast = props[0] != 'x';

      /**
       * Detect if `Array#shift` and `Array#splice` augment array-like objects correctly.
       *
       * Firefox < 10, IE compatibility mode, and IE < 9 have buggy Array `shift()`
       * and `splice()` functions that fail to remove the last element, `value[0]`,
       * of array-like objects even though the `length` property is set to `0`.
       * The `shift()` method is buggy in IE 8 compatibility mode, while `splice()`
       * is buggy regardless of mode in IE < 9 and buggy in compatibility mode in IE 9.
       *
       * @memberOf _.support
       * @type boolean
       */
      support.spliceObjects = (arrayRef.splice.call(object, 0, 1), !object[0]);

      /**
       * Detect lack of support for accessing string characters by index.
       *
       * IE < 8 can't access characters by index and IE 8 can only access
       * characters by index on string literals.
       *
       * @memberOf _.support
       * @type boolean
       */
      support.unindexedChars = ('x'[0] + Object('x')[0]) != 'xx';

      /**
       * Detect if a DOM node's [[Class]] is resolvable (all but IE < 9)
       * and that the JS engine errors when attempting to coerce an object to
       * a string without a `toString` function.
       *
       * @memberOf _.support
       * @type boolean
       */
      try {
        support.nodeClass = !(toString.call(document) == objectClass && !({ 'toString': 0 } + ''));
      } catch(e) {
        support.nodeClass = true;
      }
    }(1));

    /**
     * By default, the template delimiters used by Lo-Dash are similar to those in
     * embedded Ruby (ERB). Change the following template settings to use alternative
     * delimiters.
     *
     * @static
     * @memberOf _
     * @type Object
     */
    lodash.templateSettings = {

      /**
       * Used to detect `data` property values to be HTML-escaped.
       *
       * @memberOf _.templateSettings
       * @type RegExp
       */
      'escape': /<%-([\s\S]+?)%>/g,

      /**
       * Used to detect code to be evaluated.
       *
       * @memberOf _.templateSettings
       * @type RegExp
       */
      'evaluate': /<%([\s\S]+?)%>/g,

      /**
       * Used to detect `data` property values to inject.
       *
       * @memberOf _.templateSettings
       * @type RegExp
       */
      'interpolate': reInterpolate,

      /**
       * Used to reference the data object in the template text.
       *
       * @memberOf _.templateSettings
       * @type string
       */
      'variable': '',

      /**
       * Used to import variables into the compiled template.
       *
       * @memberOf _.templateSettings
       * @type Object
       */
      'imports': {

        /**
         * A reference to the `lodash` function.
         *
         * @memberOf _.templateSettings.imports
         * @type Function
         */
        '_': lodash
      }
    };

    /*--------------------------------------------------------------------------*/

    /**
     * The template used to create iterator functions.
     *
     * @private
     * @param {Object} data The data object used to populate the text.
     * @returns {string} Returns the interpolated text.
     */
    var iteratorTemplate = template(
      // the `iterable` may be reassigned by the `top` snippet
      'var index, iterable = <%= firstArg %>, ' +
      // assign the `result` variable an initial value
      'result = <%= init %>;\n' +
      // exit early if the first argument is falsey
      'if (!iterable) return result;\n' +
      // add code before the iteration branches
      '<%= top %>;' +

      // array-like iteration:
      '<% if (array) { %>\n' +
      'var length = iterable.length; index = -1;\n' +
      'if (<%= array %>) {' +

      // add support for accessing string characters by index if needed
      '  <% if (support.unindexedChars) { %>\n' +
      '  if (isString(iterable)) {\n' +
      "    iterable = iterable.split('')\n" +
      '  }' +
      '  <% } %>\n' +

      // iterate over the array-like value
      '  while (++index < length) {\n' +
      '    <%= loop %>;\n' +
      '  }\n' +
      '}\n' +
      'else {' +

      // object iteration:
      // add support for iterating over `arguments` objects if needed
      '  <% } else if (support.nonEnumArgs) { %>\n' +
      '  var length = iterable.length; index = -1;\n' +
      '  if (length && isArguments(iterable)) {\n' +
      '    while (++index < length) {\n' +
      "      index += '';\n" +
      '      <%= loop %>;\n' +
      '    }\n' +
      '  } else {' +
      '  <% } %>' +

      // avoid iterating over `prototype` properties in older Firefox, Opera, and Safari
      '  <% if (support.enumPrototypes) { %>\n' +
      "  var skipProto = typeof iterable == 'function';\n" +
      '  <% } %>' +

      // avoid iterating over `Error.prototype` properties in older IE and Safari
      '  <% if (support.enumErrorProps) { %>\n' +
      '  var skipErrorProps = iterable === errorProto || iterable instanceof Error;\n' +
      '  <% } %>' +

      // define conditions used in the loop
      '  <%' +
      '    var conditions = [];' +
      '    if (support.enumPrototypes) { conditions.push(\'!(skipProto && index == "prototype")\'); }' +
      '    if (support.enumErrorProps)  { conditions.push(\'!(skipErrorProps && (index == "message" || index == "name"))\'); }' +
      '  %>' +

      // iterate own properties using `Object.keys`
      '  <% if (useHas && keys) { %>\n' +
      '  var ownIndex = -1,\n' +
      '      ownProps = objectTypes[typeof iterable] && keys(iterable),\n' +
      '      length = ownProps ? ownProps.length : 0;\n\n' +
      '  while (++ownIndex < length) {\n' +
      '    index = ownProps[ownIndex];\n<%' +
      "    if (conditions.length) { %>    if (<%= conditions.join(' && ') %>) {\n  <% } %>" +
      '    <%= loop %>;' +
      '    <% if (conditions.length) { %>\n    }<% } %>\n' +
      '  }' +

      // else using a for-in loop
      '  <% } else { %>\n' +
      '  for (index in iterable) {\n<%' +
      '    if (useHas) { conditions.push("hasOwnProperty.call(iterable, index)"); }' +
      "    if (conditions.length) { %>    if (<%= conditions.join(' && ') %>) {\n  <% } %>" +
      '    <%= loop %>;' +
      '    <% if (conditions.length) { %>\n    }<% } %>\n' +
      '  }' +

      // Because IE < 9 can't set the `[[Enumerable]]` attribute of an
      // existing property and the `constructor` property of a prototype
      // defaults to non-enumerable, Lo-Dash skips the `constructor`
      // property when it infers it's iterating over a `prototype` object.
      '    <% if (support.nonEnumShadows) { %>\n\n' +
      '  if (iterable !== objectProto) {\n' +
      "    var ctor = iterable.constructor,\n" +
      '        isProto = iterable === (ctor && ctor.prototype),\n' +
      '        className = iterable === stringProto ? stringClass : iterable === errorProto ? errorClass : toString.call(iterable),\n' +
      '        nonEnum = nonEnumProps[className];\n' +
      '      <% for (k = 0; k < 7; k++) { %>\n' +
      "    index = '<%= shadowedProps[k] %>';\n" +
      '    if ((!(isProto && nonEnum[index]) && hasOwnProperty.call(iterable, index))<%' +
      '        if (!useHas) { %> || (!nonEnum[index] && iterable[index] !== objectProto[index])<% }' +
      '      %>) {\n' +
      '      <%= loop %>;\n' +
      '    }' +
      '      <% } %>\n' +
      '  }' +
      '    <% } %>' +
      '  <% } %>' +
      '  <% if (array || support.nonEnumArgs) { %>\n}<% } %>\n' +

      // add code to the bottom of the iteration function
      '<%= bottom %>;\n' +
      // finally, return the `result`
      'return result'
    );

    /*--------------------------------------------------------------------------*/

    /**
     * The base implementation of `_.bind` that creates the bound function and
     * sets its meta data.
     *
     * @private
     * @param {Array} bindData The bind data array.
     * @returns {Function} Returns the new bound function.
     */
    function baseBind(bindData) {
      var func = bindData[0],
          partialArgs = bindData[2],
          thisArg = bindData[4];

      function bound() {
        // `Function#bind` spec
        // http://es5.github.io/#x15.3.4.5
        if (partialArgs) {
          var args = partialArgs.slice();
          push.apply(args, arguments);
        }
        // mimic the constructor's `return` behavior
        // http://es5.github.io/#x13.2.2
        if (this instanceof bound) {
          // ensure `new bound` is an instance of `func`
          var thisBinding = baseCreate(func.prototype),
              result = func.apply(thisBinding, args || arguments);
          return isObject(result) ? result : thisBinding;
        }
        return func.apply(thisArg, args || arguments);
      }
      setBindData(bound, bindData);
      return bound;
    }

    /**
     * The base implementation of `_.clone` without argument juggling or support
     * for `thisArg` binding.
     *
     * @private
     * @param {*} value The value to clone.
     * @param {boolean} [isDeep=false] Specify a deep clone.
     * @param {Function} [callback] The function to customize cloning values.
     * @param {Array} [stackA=[]] Tracks traversed source objects.
     * @param {Array} [stackB=[]] Associates clones with source counterparts.
     * @returns {*} Returns the cloned value.
     */
    function baseClone(value, isDeep, callback, stackA, stackB) {
      if (callback) {
        var result = callback(value);
        if (typeof result != 'undefined') {
          return result;
        }
      }
      // inspect [[Class]]
      var isObj = isObject(value);
      if (isObj) {
        var className = toString.call(value);
        if (!cloneableClasses[className] || (!support.nodeClass && isNode(value))) {
          return value;
        }
        var ctor = ctorByClass[className];
        switch (className) {
          case boolClass:
          case dateClass:
            return new ctor(+value);

          case numberClass:
          case stringClass:
            return new ctor(value);

          case regexpClass:
            result = ctor(value.source, reFlags.exec(value));
            result.lastIndex = value.lastIndex;
            return result;
        }
      } else {
        return value;
      }
      var isArr = isArray(value);
      if (isDeep) {
        // check for circular references and return corresponding clone
        var initedStack = !stackA;
        stackA || (stackA = getArray());
        stackB || (stackB = getArray());

        var length = stackA.length;
        while (length--) {
          if (stackA[length] == value) {
            return stackB[length];
          }
        }
        result = isArr ? ctor(value.length) : {};
      }
      else {
        result = isArr ? slice(value) : assign({}, value);
      }
      // add array properties assigned by `RegExp#exec`
      if (isArr) {
        if (hasOwnProperty.call(value, 'index')) {
          result.index = value.index;
        }
        if (hasOwnProperty.call(value, 'input')) {
          result.input = value.input;
        }
      }
      // exit for shallow clone
      if (!isDeep) {
        return result;
      }
      // add the source value to the stack of traversed objects
      // and associate it with its clone
      stackA.push(value);
      stackB.push(result);

      // recursively populate clone (susceptible to call stack limits)
      (isArr ? baseEach : forOwn)(value, function(objValue, key) {
        result[key] = baseClone(objValue, isDeep, callback, stackA, stackB);
      });

      if (initedStack) {
        releaseArray(stackA);
        releaseArray(stackB);
      }
      return result;
    }

    /**
     * The base implementation of `_.create` without support for assigning
     * properties to the created object.
     *
     * @private
     * @param {Object} prototype The object to inherit from.
     * @returns {Object} Returns the new object.
     */
    function baseCreate(prototype, properties) {
      return isObject(prototype) ? nativeCreate(prototype) : {};
    }
    // fallback for browsers without `Object.create`
    if (!nativeCreate) {
      baseCreate = (function() {
        function Object() {}
        return function(prototype) {
          if (isObject(prototype)) {
            Object.prototype = prototype;
            var result = new Object;
            Object.prototype = null;
          }
          return result || context.Object();
        };
      }());
    }

    /**
     * The base implementation of `_.createCallback` without support for creating
     * "_.pluck" or "_.where" style callbacks.
     *
     * @private
     * @param {*} [func=identity] The value to convert to a callback.
     * @param {*} [thisArg] The `this` binding of the created callback.
     * @param {number} [argCount] The number of arguments the callback accepts.
     * @returns {Function} Returns a callback function.
     */
    function baseCreateCallback(func, thisArg, argCount) {
      if (typeof func != 'function') {
        return identity;
      }
      // exit early for no `thisArg` or already bound by `Function#bind`
      if (typeof thisArg == 'undefined' || !('prototype' in func)) {
        return func;
      }
      var bindData = func.__bindData__;
      if (typeof bindData == 'undefined') {
        if (support.funcNames) {
          bindData = !func.name;
        }
        bindData = bindData || !support.funcDecomp;
        if (!bindData) {
          var source = fnToString.call(func);
          if (!support.funcNames) {
            bindData = !reFuncName.test(source);
          }
          if (!bindData) {
            // checks if `func` references the `this` keyword and stores the result
            bindData = reThis.test(source);
            setBindData(func, bindData);
          }
        }
      }
      // exit early if there are no `this` references or `func` is bound
      if (bindData === false || (bindData !== true && bindData[1] & 1)) {
        return func;
      }
      switch (argCount) {
        case 1: return function(value) {
          return func.call(thisArg, value);
        };
        case 2: return function(a, b) {
          return func.call(thisArg, a, b);
        };
        case 3: return function(value, index, collection) {
          return func.call(thisArg, value, index, collection);
        };
        case 4: return function(accumulator, value, index, collection) {
          return func.call(thisArg, accumulator, value, index, collection);
        };
      }
      return bind(func, thisArg);
    }

    /**
     * The base implementation of `createWrapper` that creates the wrapper and
     * sets its meta data.
     *
     * @private
     * @param {Array} bindData The bind data array.
     * @returns {Function} Returns the new function.
     */
    function baseCreateWrapper(bindData) {
      var func = bindData[0],
          bitmask = bindData[1],
          partialArgs = bindData[2],
          partialRightArgs = bindData[3],
          thisArg = bindData[4],
          arity = bindData[5];

      var isBind = bitmask & 1,
          isBindKey = bitmask & 2,
          isCurry = bitmask & 4,
          isCurryBound = bitmask & 8,
          key = func;

      function bound() {
        var thisBinding = isBind ? thisArg : this;
        if (partialArgs) {
          var args = partialArgs.slice();
          push.apply(args, arguments);
        }
        if (partialRightArgs || isCurry) {
          args || (args = slice(arguments));
          if (partialRightArgs) {
            push.apply(args, partialRightArgs);
          }
          if (isCurry && args.length < arity) {
            bitmask |= 16 & ~32;
            return baseCreateWrapper([func, (isCurryBound ? bitmask : bitmask & ~3), args, null, thisArg, arity]);
          }
        }
        args || (args = arguments);
        if (isBindKey) {
          func = thisBinding[key];
        }
        if (this instanceof bound) {
          thisBinding = baseCreate(func.prototype);
          var result = func.apply(thisBinding, args);
          return isObject(result) ? result : thisBinding;
        }
        return func.apply(thisBinding, args);
      }
      setBindData(bound, bindData);
      return bound;
    }

    /**
     * The base implementation of `_.difference` that accepts a single array
     * of values to exclude.
     *
     * @private
     * @param {Array} array The array to process.
     * @param {Array} [values] The array of values to exclude.
     * @returns {Array} Returns a new array of filtered values.
     */
    function baseDifference(array, values) {
      var index = -1,
          indexOf = getIndexOf(),
          length = array ? array.length : 0,
          isLarge = length >= largeArraySize && indexOf === baseIndexOf,
          result = [];

      if (isLarge) {
        var cache = createCache(values);
        if (cache) {
          indexOf = cacheIndexOf;
          values = cache;
        } else {
          isLarge = false;
        }
      }
      while (++index < length) {
        var value = array[index];
        if (indexOf(values, value) < 0) {
          result.push(value);
        }
      }
      if (isLarge) {
        releaseObject(values);
      }
      return result;
    }

    /**
     * The base implementation of `_.flatten` without support for callback
     * shorthands or `thisArg` binding.
     *
     * @private
     * @param {Array} array The array to flatten.
     * @param {boolean} [isShallow=false] A flag to restrict flattening to a single level.
     * @param {boolean} [isStrict=false] A flag to restrict flattening to arrays and `arguments` objects.
     * @param {number} [fromIndex=0] The index to start from.
     * @returns {Array} Returns a new flattened array.
     */
    function baseFlatten(array, isShallow, isStrict, fromIndex) {
      var index = (fromIndex || 0) - 1,
          length = array ? array.length : 0,
          result = [];

      while (++index < length) {
        var value = array[index];

        if (value && typeof value == 'object' && typeof value.length == 'number'
            && (isArray(value) || isArguments(value))) {
          // recursively flatten arrays (susceptible to call stack limits)
          if (!isShallow) {
            value = baseFlatten(value, isShallow, isStrict);
          }
          var valIndex = -1,
              valLength = value.length,
              resIndex = result.length;

          result.length += valLength;
          while (++valIndex < valLength) {
            result[resIndex++] = value[valIndex];
          }
        } else if (!isStrict) {
          result.push(value);
        }
      }
      return result;
    }

    /**
     * The base implementation of `_.isEqual`, without support for `thisArg` binding,
     * that allows partial "_.where" style comparisons.
     *
     * @private
     * @param {*} a The value to compare.
     * @param {*} b The other value to compare.
     * @param {Function} [callback] The function to customize comparing values.
     * @param {Function} [isWhere=false] A flag to indicate performing partial comparisons.
     * @param {Array} [stackA=[]] Tracks traversed `a` objects.
     * @param {Array} [stackB=[]] Tracks traversed `b` objects.
     * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
     */
    function baseIsEqual(a, b, callback, isWhere, stackA, stackB) {
      // used to indicate that when comparing objects, `a` has at least the properties of `b`
      if (callback) {
        var result = callback(a, b);
        if (typeof result != 'undefined') {
          return !!result;
        }
      }
      // exit early for identical values
      if (a === b) {
        // treat `+0` vs. `-0` as not equal
        return a !== 0 || (1 / a == 1 / b);
      }
      var type = typeof a,
          otherType = typeof b;

      // exit early for unlike primitive values
      if (a === a &&
          !(a && objectTypes[type]) &&
          !(b && objectTypes[otherType])) {
        return false;
      }
      // exit early for `null` and `undefined` avoiding ES3's Function#call behavior
      // http://es5.github.io/#x15.3.4.4
      if (a == null || b == null) {
        return a === b;
      }
      // compare [[Class]] names
      var className = toString.call(a),
          otherClass = toString.call(b);

      if (className == argsClass) {
        className = objectClass;
      }
      if (otherClass == argsClass) {
        otherClass = objectClass;
      }
      if (className != otherClass) {
        return false;
      }
      switch (className) {
        case boolClass:
        case dateClass:
          // coerce dates and booleans to numbers, dates to milliseconds and booleans
          // to `1` or `0` treating invalid dates coerced to `NaN` as not equal
          return +a == +b;

        case numberClass:
          // treat `NaN` vs. `NaN` as equal
          return (a != +a)
            ? b != +b
            // but treat `+0` vs. `-0` as not equal
            : (a == 0 ? (1 / a == 1 / b) : a == +b);

        case regexpClass:
        case stringClass:
          // coerce regexes to strings (http://es5.github.io/#x15.10.6.4)
          // treat string primitives and their corresponding object instances as equal
          return a == String(b);
      }
      var isArr = className == arrayClass;
      if (!isArr) {
        // unwrap any `lodash` wrapped values
        var aWrapped = hasOwnProperty.call(a, '__wrapped__'),
            bWrapped = hasOwnProperty.call(b, '__wrapped__');

        if (aWrapped || bWrapped) {
          return baseIsEqual(aWrapped ? a.__wrapped__ : a, bWrapped ? b.__wrapped__ : b, callback, isWhere, stackA, stackB);
        }
        // exit for functions and DOM nodes
        if (className != objectClass || (!support.nodeClass && (isNode(a) || isNode(b)))) {
          return false;
        }
        // in older versions of Opera, `arguments` objects have `Array` constructors
        var ctorA = !support.argsObject && isArguments(a) ? Object : a.constructor,
            ctorB = !support.argsObject && isArguments(b) ? Object : b.constructor;

        // non `Object` object instances with different constructors are not equal
        if (ctorA != ctorB &&
              !(isFunction(ctorA) && ctorA instanceof ctorA && isFunction(ctorB) && ctorB instanceof ctorB) &&
              ('constructor' in a && 'constructor' in b)
            ) {
          return false;
        }
      }
      // assume cyclic structures are equal
      // the algorithm for detecting cyclic structures is adapted from ES 5.1
      // section 15.12.3, abstract operation `JO` (http://es5.github.io/#x15.12.3)
      var initedStack = !stackA;
      stackA || (stackA = getArray());
      stackB || (stackB = getArray());

      var length = stackA.length;
      while (length--) {
        if (stackA[length] == a) {
          return stackB[length] == b;
        }
      }
      var size = 0;
      result = true;

      // add `a` and `b` to the stack of traversed objects
      stackA.push(a);
      stackB.push(b);

      // recursively compare objects and arrays (susceptible to call stack limits)
      if (isArr) {
        length = a.length;
        size = b.length;

        // compare lengths to determine if a deep comparison is necessary
        result = size == a.length;
        if (!result && !isWhere) {
          return result;
        }
        // deep compare the contents, ignoring non-numeric properties
        while (size--) {
          var index = length,
              value = b[size];

          if (isWhere) {
            while (index--) {
              if ((result = baseIsEqual(a[index], value, callback, isWhere, stackA, stackB))) {
                break;
              }
            }
          } else if (!(result = baseIsEqual(a[size], value, callback, isWhere, stackA, stackB))) {
            break;
          }
        }
        return result;
      }
      // deep compare objects using `forIn`, instead of `forOwn`, to avoid `Object.keys`
      // which, in this case, is more costly
      forIn(b, function(value, key, b) {
        if (hasOwnProperty.call(b, key)) {
          // count the number of properties.
          size++;
          // deep compare each property value.
          return (result = hasOwnProperty.call(a, key) && baseIsEqual(a[key], value, callback, isWhere, stackA, stackB));
        }
      });

      if (result && !isWhere) {
        // ensure both objects have the same number of properties
        forIn(a, function(value, key, a) {
          if (hasOwnProperty.call(a, key)) {
            // `size` will be `-1` if `a` has more properties than `b`
            return (result = --size > -1);
          }
        });
      }
      if (initedStack) {
        releaseArray(stackA);
        releaseArray(stackB);
      }
      return result;
    }

    /**
     * The base implementation of `_.merge` without argument juggling or support
     * for `thisArg` binding.
     *
     * @private
     * @param {Object} object The destination object.
     * @param {Object} source The source object.
     * @param {Function} [callback] The function to customize merging properties.
     * @param {Array} [stackA=[]] Tracks traversed source objects.
     * @param {Array} [stackB=[]] Associates values with source counterparts.
     */
    function baseMerge(object, source, callback, stackA, stackB) {
      (isArray(source) ? forEach : forOwn)(source, function(source, key) {
        var found,
            isArr,
            result = source,
            value = object[key];

        if (source && ((isArr = isArray(source)) || isPlainObject(source))) {
          // avoid merging previously merged cyclic sources
          var stackLength = stackA.length;
          while (stackLength--) {
            if ((found = stackA[stackLength] == source)) {
              value = stackB[stackLength];
              break;
            }
          }
          if (!found) {
            var isShallow;
            if (callback) {
              result = callback(value, source);
              if ((isShallow = typeof result != 'undefined')) {
                value = result;
              }
            }
            if (!isShallow) {
              value = isArr
                ? (isArray(value) ? value : [])
                : (isPlainObject(value) ? value : {});
            }
            // add `source` and associated `value` to the stack of traversed objects
            stackA.push(source);
            stackB.push(value);

            // recursively merge objects and arrays (susceptible to call stack limits)
            if (!isShallow) {
              baseMerge(value, source, callback, stackA, stackB);
            }
          }
        }
        else {
          if (callback) {
            result = callback(value, source);
            if (typeof result == 'undefined') {
              result = source;
            }
          }
          if (typeof result != 'undefined') {
            value = result;
          }
        }
        object[key] = value;
      });
    }

    /**
     * The base implementation of `_.random` without argument juggling or support
     * for returning floating-point numbers.
     *
     * @private
     * @param {number} min The minimum possible value.
     * @param {number} max The maximum possible value.
     * @returns {number} Returns a random number.
     */
    function baseRandom(min, max) {
      return min + floor(nativeRandom() * (max - min + 1));
    }

    /**
     * The base implementation of `_.uniq` without support for callback shorthands
     * or `thisArg` binding.
     *
     * @private
     * @param {Array} array The array to process.
     * @param {boolean} [isSorted=false] A flag to indicate that `array` is sorted.
     * @param {Function} [callback] The function called per iteration.
     * @returns {Array} Returns a duplicate-value-free array.
     */
    function baseUniq(array, isSorted, callback) {
      var index = -1,
          indexOf = getIndexOf(),
          length = array ? array.length : 0,
          result = [];

      var isLarge = !isSorted && length >= largeArraySize && indexOf === baseIndexOf,
          seen = (callback || isLarge) ? getArray() : result;

      if (isLarge) {
        var cache = createCache(seen);
        if (cache) {
          indexOf = cacheIndexOf;
          seen = cache;
        } else {
          isLarge = false;
          seen = callback ? seen : (releaseArray(seen), result);
        }
      }
      while (++index < length) {
        var value = array[index],
            computed = callback ? callback(value, index, array) : value;

        if (isSorted
              ? !index || seen[seen.length - 1] !== computed
              : indexOf(seen, computed) < 0
            ) {
          if (callback || isLarge) {
            seen.push(computed);
          }
          result.push(value);
        }
      }
      if (isLarge) {
        releaseArray(seen.array);
        releaseObject(seen);
      } else if (callback) {
        releaseArray(seen);
      }
      return result;
    }

    /**
     * Creates a function that aggregates a collection, creating an object composed
     * of keys generated from the results of running each element of the collection
     * through a callback. The given `setter` function sets the keys and values
     * of the composed object.
     *
     * @private
     * @param {Function} setter The setter function.
     * @returns {Function} Returns the new aggregator function.
     */
    function createAggregator(setter) {
      return function(collection, callback, thisArg) {
        var result = {};
        callback = lodash.createCallback(callback, thisArg, 3);

        if (isArray(collection)) {
          var index = -1,
              length = collection.length;

          while (++index < length) {
            var value = collection[index];
            setter(result, value, callback(value, index, collection), collection);
          }
        } else {
          baseEach(collection, function(value, key, collection) {
            setter(result, value, callback(value, key, collection), collection);
          });
        }
        return result;
      };
    }

    /**
     * Creates a function that, when called, either curries or invokes `func`
     * with an optional `this` binding and partially applied arguments.
     *
     * @private
     * @param {Function|string} func The function or method name to reference.
     * @param {number} bitmask The bitmask of method flags to compose.
     *  The bitmask may be composed of the following flags:
     *  1 - `_.bind`
     *  2 - `_.bindKey`
     *  4 - `_.curry`
     *  8 - `_.curry` (bound)
     *  16 - `_.partial`
     *  32 - `_.partialRight`
     * @param {Array} [partialArgs] An array of arguments to prepend to those
     *  provided to the new function.
     * @param {Array} [partialRightArgs] An array of arguments to append to those
     *  provided to the new function.
     * @param {*} [thisArg] The `this` binding of `func`.
     * @param {number} [arity] The arity of `func`.
     * @returns {Function} Returns the new function.
     */
    function createWrapper(func, bitmask, partialArgs, partialRightArgs, thisArg, arity) {
      var isBind = bitmask & 1,
          isBindKey = bitmask & 2,
          isCurry = bitmask & 4,
          isCurryBound = bitmask & 8,
          isPartial = bitmask & 16,
          isPartialRight = bitmask & 32;

      if (!isBindKey && !isFunction(func)) {
        throw new TypeError;
      }
      if (isPartial && !partialArgs.length) {
        bitmask &= ~16;
        isPartial = partialArgs = false;
      }
      if (isPartialRight && !partialRightArgs.length) {
        bitmask &= ~32;
        isPartialRight = partialRightArgs = false;
      }
      var bindData = func && func.__bindData__;
      if (bindData && bindData !== true) {
        bindData = bindData.slice();

        // set `thisBinding` is not previously bound
        if (isBind && !(bindData[1] & 1)) {
          bindData[4] = thisArg;
        }
        // set if previously bound but not currently (subsequent curried functions)
        if (!isBind && bindData[1] & 1) {
          bitmask |= 8;
        }
        // set curried arity if not yet set
        if (isCurry && !(bindData[1] & 4)) {
          bindData[5] = arity;
        }
        // append partial left arguments
        if (isPartial) {
          push.apply(bindData[2] || (bindData[2] = []), partialArgs);
        }
        // append partial right arguments
        if (isPartialRight) {
          push.apply(bindData[3] || (bindData[3] = []), partialRightArgs);
        }
        // merge flags
        bindData[1] |= bitmask;
        return createWrapper.apply(null, bindData);
      }
      // fast path for `_.bind`
      var creater = (bitmask == 1 || bitmask === 17) ? baseBind : baseCreateWrapper;
      return creater([func, bitmask, partialArgs, partialRightArgs, thisArg, arity]);
    }

    /**
     * Creates compiled iteration functions.
     *
     * @private
     * @param {...Object} [options] The compile options object(s).
     * @param {string} [options.array] Code to determine if the iterable is an array or array-like.
     * @param {boolean} [options.useHas] Specify using `hasOwnProperty` checks in the object loop.
     * @param {Function} [options.keys] A reference to `_.keys` for use in own property iteration.
     * @param {string} [options.args] A comma separated string of iteration function arguments.
     * @param {string} [options.top] Code to execute before the iteration branches.
     * @param {string} [options.loop] Code to execute in the object loop.
     * @param {string} [options.bottom] Code to execute after the iteration branches.
     * @returns {Function} Returns the compiled function.
     */
    function createIterator() {
      // data properties
      iteratorData.shadowedProps = shadowedProps;
      iteratorData.support = support;

      // iterator options
      iteratorData.array = iteratorData.bottom = iteratorData.loop = iteratorData.top = '';
      iteratorData.init = 'iterable';
      iteratorData.useHas = true;

      // merge options into a template data object
      for (var object, index = 0; object = arguments[index]; index++) {
        for (var key in object) {
          iteratorData[key] = object[key];
        }
      }
      var args = iteratorData.args;
      iteratorData.firstArg = /^[^,]+/.exec(args)[0];

      // create the function factory
      var factory = Function(
          'baseCreateCallback, errorClass, errorProto, hasOwnProperty, ' +
          'indicatorObject, isArguments, isArray, isString, keys, objectProto, ' +
          'objectTypes, nonEnumProps, stringClass, stringProto, toString',
        'return function(' + args + ') {\n' + iteratorTemplate(iteratorData) + '\n}'
      );

      // return the compiled function
      return factory(
        baseCreateCallback, errorClass, errorProto, hasOwnProperty,
        indicatorObject, isArguments, isArray, isString, iteratorData.keys, objectProto,
        objectTypes, nonEnumProps, stringClass, stringProto, toString
      );
    }

    /**
     * Used by `escape` to convert characters to HTML entities.
     *
     * @private
     * @param {string} match The matched character to escape.
     * @returns {string} Returns the escaped character.
     */
    function escapeHtmlChar(match) {
      return htmlEscapes[match];
    }

    /**
     * Gets the appropriate "indexOf" function. If the `_.indexOf` method is
     * customized, this method returns the custom method, otherwise it returns
     * the `baseIndexOf` function.
     *
     * @private
     * @returns {Function} Returns the "indexOf" function.
     */
    function getIndexOf() {
      var result = (result = lodash.indexOf) === indexOf ? baseIndexOf : result;
      return result;
    }

    /**
     * Sets `this` binding data on a given function.
     *
     * @private
     * @param {Function} func The function to set data on.
     * @param {Array} value The data array to set.
     */
    var setBindData = !defineProperty ? noop : function(func, value) {
      descriptor.value = value;
      defineProperty(func, '__bindData__', descriptor);
    };

    /**
     * A fallback implementation of `isPlainObject` which checks if a given value
     * is an object created by the `Object` constructor, assuming objects created
     * by the `Object` constructor have no inherited enumerable properties and that
     * there are no `Object.prototype` extensions.
     *
     * @private
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
     */
    function shimIsPlainObject(value) {
      var ctor,
          result;

      // avoid non Object objects, `arguments` objects, and DOM elements
      if (!(value && toString.call(value) == objectClass) ||
          (ctor = value.constructor, isFunction(ctor) && !(ctor instanceof ctor)) ||
          (!support.argsClass && isArguments(value)) ||
          (!support.nodeClass && isNode(value))) {
        return false;
      }
      // IE < 9 iterates inherited properties before own properties. If the first
      // iterated property is an object's own property then there are no inherited
      // enumerable properties.
      if (support.ownLast) {
        forIn(value, function(value, key, object) {
          result = hasOwnProperty.call(object, key);
          return false;
        });
        return result !== false;
      }
      // In most environments an object's own properties are iterated before
      // its inherited properties. If the last iterated property is an object's
      // own property then there are no inherited enumerable properties.
      forIn(value, function(value, key) {
        result = key;
      });
      return typeof result == 'undefined' || hasOwnProperty.call(value, result);
    }

    /**
     * Used by `unescape` to convert HTML entities to characters.
     *
     * @private
     * @param {string} match The matched character to unescape.
     * @returns {string} Returns the unescaped character.
     */
    function unescapeHtmlChar(match) {
      return htmlUnescapes[match];
    }

    /*--------------------------------------------------------------------------*/

    /**
     * Checks if `value` is an `arguments` object.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is an `arguments` object, else `false`.
     * @example
     *
     * (function() { return _.isArguments(arguments); })(1, 2, 3);
     * // => true
     *
     * _.isArguments([1, 2, 3]);
     * // => false
     */
    function isArguments(value) {
      return value && typeof value == 'object' && typeof value.length == 'number' &&
        toString.call(value) == argsClass || false;
    }
    // fallback for browsers that can't detect `arguments` objects by [[Class]]
    if (!support.argsClass) {
      isArguments = function(value) {
        return value && typeof value == 'object' && typeof value.length == 'number' &&
          hasOwnProperty.call(value, 'callee') && !propertyIsEnumerable.call(value, 'callee') || false;
      };
    }

    /**
     * Checks if `value` is an array.
     *
     * @static
     * @memberOf _
     * @type Function
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is an array, else `false`.
     * @example
     *
     * (function() { return _.isArray(arguments); })();
     * // => false
     *
     * _.isArray([1, 2, 3]);
     * // => true
     */
    var isArray = nativeIsArray || function(value) {
      return value && typeof value == 'object' && typeof value.length == 'number' &&
        toString.call(value) == arrayClass || false;
    };

    /**
     * A fallback implementation of `Object.keys` which produces an array of the
     * given object's own enumerable property names.
     *
     * @private
     * @type Function
     * @param {Object} object The object to inspect.
     * @returns {Array} Returns an array of property names.
     */
    var shimKeys = createIterator({
      'args': 'object',
      'init': '[]',
      'top': 'if (!(objectTypes[typeof object])) return result',
      'loop': 'result.push(index)'
    });

    /**
     * Creates an array composed of the own enumerable property names of an object.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The object to inspect.
     * @returns {Array} Returns an array of property names.
     * @example
     *
     * _.keys({ 'one': 1, 'two': 2, 'three': 3 });
     * // => ['one', 'two', 'three'] (property order is not guaranteed across environments)
     */
    var keys = !nativeKeys ? shimKeys : function(object) {
      if (!isObject(object)) {
        return [];
      }
      if ((support.enumPrototypes && typeof object == 'function') ||
          (support.nonEnumArgs && object.length && isArguments(object))) {
        return shimKeys(object);
      }
      return nativeKeys(object);
    };

    /** Reusable iterator options shared by `each`, `forIn`, and `forOwn` */
    var eachIteratorOptions = {
      'args': 'collection, callback, thisArg',
      'top': "callback = callback && typeof thisArg == 'undefined' ? callback : baseCreateCallback(callback, thisArg, 3)",
      'array': "typeof length == 'number'",
      'keys': keys,
      'loop': 'if (callback(iterable[index], index, collection) === false) return result'
    };

    /** Reusable iterator options for `assign` and `defaults` */
    var defaultsIteratorOptions = {
      'args': 'object, source, guard',
      'top':
        'var args = arguments,\n' +
        '    argsIndex = 0,\n' +
        "    argsLength = typeof guard == 'number' ? 2 : args.length;\n" +
        'while (++argsIndex < argsLength) {\n' +
        '  iterable = args[argsIndex];\n' +
        '  if (iterable && objectTypes[typeof iterable]) {',
      'keys': keys,
      'loop': "if (typeof result[index] == 'undefined') result[index] = iterable[index]",
      'bottom': '  }\n}'
    };

    /** Reusable iterator options for `forIn` and `forOwn` */
    var forOwnIteratorOptions = {
      'top': 'if (!objectTypes[typeof iterable]) return result;\n' + eachIteratorOptions.top,
      'array': false
    };

    /**
     * Used to convert characters to HTML entities:
     *
     * Though the `>` character is escaped for symmetry, characters like `>` and `/`
     * don't require escaping in HTML and have no special meaning unless they're part
     * of a tag or an unquoted attribute value.
     * http://mathiasbynens.be/notes/ambiguous-ampersands (under "semi-related fun fact")
     */
    var htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    /** Used to convert HTML entities to characters */
    var htmlUnescapes = invert(htmlEscapes);

    /** Used to match HTML entities and HTML characters */
    var reEscapedHtml = RegExp('(' + keys(htmlUnescapes).join('|') + ')', 'g'),
        reUnescapedHtml = RegExp('[' + keys(htmlEscapes).join('') + ']', 'g');

    /**
     * A function compiled to iterate `arguments` objects, arrays, objects, and
     * strings consistenly across environments, executing the callback for each
     * element in the collection. The callback is bound to `thisArg` and invoked
     * with three arguments; (value, index|key, collection). Callbacks may exit
     * iteration early by explicitly returning `false`.
     *
     * @private
     * @type Function
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function} [callback=identity] The function called per iteration.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array|Object|string} Returns `collection`.
     */
    var baseEach = createIterator(eachIteratorOptions);

    /*--------------------------------------------------------------------------*/

    /**
     * Assigns own enumerable properties of source object(s) to the destination
     * object. Subsequent sources will overwrite property assignments of previous
     * sources. If a callback is provided it will be executed to produce the
     * assigned values. The callback is bound to `thisArg` and invoked with two
     * arguments; (objectValue, sourceValue).
     *
     * @static
     * @memberOf _
     * @type Function
     * @alias extend
     * @category Objects
     * @param {Object} object The destination object.
     * @param {...Object} [source] The source objects.
     * @param {Function} [callback] The function to customize assigning values.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Object} Returns the destination object.
     * @example
     *
     * _.assign({ 'name': 'fred' }, { 'employer': 'slate' });
     * // => { 'name': 'fred', 'employer': 'slate' }
     *
     * var defaults = _.partialRight(_.assign, function(a, b) {
     *   return typeof a == 'undefined' ? b : a;
     * });
     *
     * var object = { 'name': 'barney' };
     * defaults(object, { 'name': 'fred', 'employer': 'slate' });
     * // => { 'name': 'barney', 'employer': 'slate' }
     */
    var assign = createIterator(defaultsIteratorOptions, {
      'top':
        defaultsIteratorOptions.top.replace(';',
          ';\n' +
          "if (argsLength > 3 && typeof args[argsLength - 2] == 'function') {\n" +
          '  var callback = baseCreateCallback(args[--argsLength - 1], args[argsLength--], 2);\n' +
          "} else if (argsLength > 2 && typeof args[argsLength - 1] == 'function') {\n" +
          '  callback = args[--argsLength];\n' +
          '}'
        ),
      'loop': 'result[index] = callback ? callback(result[index], iterable[index]) : iterable[index]'
    });

    /**
     * Creates a clone of `value`. If `isDeep` is `true` nested objects will also
     * be cloned, otherwise they will be assigned by reference. If a callback
     * is provided it will be executed to produce the cloned values. If the
     * callback returns `undefined` cloning will be handled by the method instead.
     * The callback is bound to `thisArg` and invoked with one argument; (value).
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to clone.
     * @param {boolean} [isDeep=false] Specify a deep clone.
     * @param {Function} [callback] The function to customize cloning values.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {*} Returns the cloned value.
     * @example
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36 },
     *   { 'name': 'fred',   'age': 40 }
     * ];
     *
     * var shallow = _.clone(characters);
     * shallow[0] === characters[0];
     * // => true
     *
     * var deep = _.clone(characters, true);
     * deep[0] === characters[0];
     * // => false
     *
     * _.mixin({
     *   'clone': _.partialRight(_.clone, function(value) {
     *     return _.isElement(value) ? value.cloneNode(false) : undefined;
     *   })
     * });
     *
     * var clone = _.clone(document.body);
     * clone.childNodes.length;
     * // => 0
     */
    function clone(value, isDeep, callback, thisArg) {
      // allows working with "Collections" methods without using their `index`
      // and `collection` arguments for `isDeep` and `callback`
      if (typeof isDeep != 'boolean' && isDeep != null) {
        thisArg = callback;
        callback = isDeep;
        isDeep = false;
      }
      return baseClone(value, isDeep, typeof callback == 'function' && baseCreateCallback(callback, thisArg, 1));
    }

    /**
     * Creates a deep clone of `value`. If a callback is provided it will be
     * executed to produce the cloned values. If the callback returns `undefined`
     * cloning will be handled by the method instead. The callback is bound to
     * `thisArg` and invoked with one argument; (value).
     *
     * Note: This method is loosely based on the structured clone algorithm. Functions
     * and DOM nodes are **not** cloned. The enumerable properties of `arguments` objects and
     * objects created by constructors other than `Object` are cloned to plain `Object` objects.
     * See http://www.w3.org/TR/html5/infrastructure.html#internal-structured-cloning-algorithm.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to deep clone.
     * @param {Function} [callback] The function to customize cloning values.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {*} Returns the deep cloned value.
     * @example
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36 },
     *   { 'name': 'fred',   'age': 40 }
     * ];
     *
     * var deep = _.cloneDeep(characters);
     * deep[0] === characters[0];
     * // => false
     *
     * var view = {
     *   'label': 'docs',
     *   'node': element
     * };
     *
     * var clone = _.cloneDeep(view, function(value) {
     *   return _.isElement(value) ? value.cloneNode(true) : undefined;
     * });
     *
     * clone.node == view.node;
     * // => false
     */
    function cloneDeep(value, callback, thisArg) {
      return baseClone(value, true, typeof callback == 'function' && baseCreateCallback(callback, thisArg, 1));
    }

    /**
     * Creates an object that inherits from the given `prototype` object. If a
     * `properties` object is provided its own enumerable properties are assigned
     * to the created object.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} prototype The object to inherit from.
     * @param {Object} [properties] The properties to assign to the object.
     * @returns {Object} Returns the new object.
     * @example
     *
     * function Shape() {
     *   this.x = 0;
     *   this.y = 0;
     * }
     *
     * function Circle() {
     *   Shape.call(this);
     * }
     *
     * Circle.prototype = _.create(Shape.prototype, { 'constructor': Circle });
     *
     * var circle = new Circle;
     * circle instanceof Circle;
     * // => true
     *
     * circle instanceof Shape;
     * // => true
     */
    function create(prototype, properties) {
      var result = baseCreate(prototype);
      return properties ? assign(result, properties) : result;
    }

    /**
     * Assigns own enumerable properties of source object(s) to the destination
     * object for all destination properties that resolve to `undefined`. Once a
     * property is set, additional defaults of the same property will be ignored.
     *
     * @static
     * @memberOf _
     * @type Function
     * @category Objects
     * @param {Object} object The destination object.
     * @param {...Object} [source] The source objects.
     * @param- {Object} [guard] Allows working with `_.reduce` without using its
     *  `key` and `object` arguments as sources.
     * @returns {Object} Returns the destination object.
     * @example
     *
     * var object = { 'name': 'barney' };
     * _.defaults(object, { 'name': 'fred', 'employer': 'slate' });
     * // => { 'name': 'barney', 'employer': 'slate' }
     */
    var defaults = createIterator(defaultsIteratorOptions);

    /**
     * This method is like `_.findIndex` except that it returns the key of the
     * first element that passes the callback check, instead of the element itself.
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The object to search.
     * @param {Function|Object|string} [callback=identity] The function called per
     *  iteration. If a property name or object is provided it will be used to
     *  create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {string|undefined} Returns the key of the found element, else `undefined`.
     * @example
     *
     * var characters = {
     *   'barney': {  'age': 36, 'blocked': false },
     *   'fred': {    'age': 40, 'blocked': true },
     *   'pebbles': { 'age': 1,  'blocked': false }
     * };
     *
     * _.findKey(characters, function(chr) {
     *   return chr.age < 40;
     * });
     * // => 'barney' (property order is not guaranteed across environments)
     *
     * // using "_.where" callback shorthand
     * _.findKey(characters, { 'age': 1 });
     * // => 'pebbles'
     *
     * // using "_.pluck" callback shorthand
     * _.findKey(characters, 'blocked');
     * // => 'fred'
     */
    function findKey(object, callback, thisArg) {
      var result;
      callback = lodash.createCallback(callback, thisArg, 3);
      forOwn(object, function(value, key, object) {
        if (callback(value, key, object)) {
          result = key;
          return false;
        }
      });
      return result;
    }

    /**
     * This method is like `_.findKey` except that it iterates over elements
     * of a `collection` in the opposite order.
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The object to search.
     * @param {Function|Object|string} [callback=identity] The function called per
     *  iteration. If a property name or object is provided it will be used to
     *  create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {string|undefined} Returns the key of the found element, else `undefined`.
     * @example
     *
     * var characters = {
     *   'barney': {  'age': 36, 'blocked': true },
     *   'fred': {    'age': 40, 'blocked': false },
     *   'pebbles': { 'age': 1,  'blocked': true }
     * };
     *
     * _.findLastKey(characters, function(chr) {
     *   return chr.age < 40;
     * });
     * // => returns `pebbles`, assuming `_.findKey` returns `barney`
     *
     * // using "_.where" callback shorthand
     * _.findLastKey(characters, { 'age': 40 });
     * // => 'fred'
     *
     * // using "_.pluck" callback shorthand
     * _.findLastKey(characters, 'blocked');
     * // => 'pebbles'
     */
    function findLastKey(object, callback, thisArg) {
      var result;
      callback = lodash.createCallback(callback, thisArg, 3);
      forOwnRight(object, function(value, key, object) {
        if (callback(value, key, object)) {
          result = key;
          return false;
        }
      });
      return result;
    }

    /**
     * Iterates over own and inherited enumerable properties of an object,
     * executing the callback for each property. The callback is bound to `thisArg`
     * and invoked with three arguments; (value, key, object). Callbacks may exit
     * iteration early by explicitly returning `false`.
     *
     * @static
     * @memberOf _
     * @type Function
     * @category Objects
     * @param {Object} object The object to iterate over.
     * @param {Function} [callback=identity] The function called per iteration.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Object} Returns `object`.
     * @example
     *
     * function Shape() {
     *   this.x = 0;
     *   this.y = 0;
     * }
     *
     * Shape.prototype.move = function(x, y) {
     *   this.x += x;
     *   this.y += y;
     * };
     *
     * _.forIn(new Shape, function(value, key) {
     *   console.log(key);
     * });
     * // => logs 'x', 'y', and 'move' (property order is not guaranteed across environments)
     */
    var forIn = createIterator(eachIteratorOptions, forOwnIteratorOptions, {
      'useHas': false
    });

    /**
     * This method is like `_.forIn` except that it iterates over elements
     * of a `collection` in the opposite order.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The object to iterate over.
     * @param {Function} [callback=identity] The function called per iteration.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Object} Returns `object`.
     * @example
     *
     * function Shape() {
     *   this.x = 0;
     *   this.y = 0;
     * }
     *
     * Shape.prototype.move = function(x, y) {
     *   this.x += x;
     *   this.y += y;
     * };
     *
     * _.forInRight(new Shape, function(value, key) {
     *   console.log(key);
     * });
     * // => logs 'move', 'y', and 'x' assuming `_.forIn ` logs 'x', 'y', and 'move'
     */
    function forInRight(object, callback, thisArg) {
      var pairs = [];

      forIn(object, function(value, key) {
        pairs.push(key, value);
      });

      var length = pairs.length;
      callback = baseCreateCallback(callback, thisArg, 3);
      while (length--) {
        if (callback(pairs[length--], pairs[length], object) === false) {
          break;
        }
      }
      return object;
    }

    /**
     * Iterates over own enumerable properties of an object, executing the callback
     * for each property. The callback is bound to `thisArg` and invoked with three
     * arguments; (value, key, object). Callbacks may exit iteration early by
     * explicitly returning `false`.
     *
     * @static
     * @memberOf _
     * @type Function
     * @category Objects
     * @param {Object} object The object to iterate over.
     * @param {Function} [callback=identity] The function called per iteration.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Object} Returns `object`.
     * @example
     *
     * _.forOwn({ '0': 'zero', '1': 'one', 'length': 2 }, function(num, key) {
     *   console.log(key);
     * });
     * // => logs '0', '1', and 'length' (property order is not guaranteed across environments)
     */
    var forOwn = createIterator(eachIteratorOptions, forOwnIteratorOptions);

    /**
     * This method is like `_.forOwn` except that it iterates over elements
     * of a `collection` in the opposite order.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The object to iterate over.
     * @param {Function} [callback=identity] The function called per iteration.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Object} Returns `object`.
     * @example
     *
     * _.forOwnRight({ '0': 'zero', '1': 'one', 'length': 2 }, function(num, key) {
     *   console.log(key);
     * });
     * // => logs 'length', '1', and '0' assuming `_.forOwn` logs '0', '1', and 'length'
     */
    function forOwnRight(object, callback, thisArg) {
      var props = keys(object),
          length = props.length;

      callback = baseCreateCallback(callback, thisArg, 3);
      while (length--) {
        var key = props[length];
        if (callback(object[key], key, object) === false) {
          break;
        }
      }
      return object;
    }

    /**
     * Creates a sorted array of property names of all enumerable properties,
     * own and inherited, of `object` that have function values.
     *
     * @static
     * @memberOf _
     * @alias methods
     * @category Objects
     * @param {Object} object The object to inspect.
     * @returns {Array} Returns an array of property names that have function values.
     * @example
     *
     * _.functions(_);
     * // => ['all', 'any', 'bind', 'bindAll', 'clone', 'compact', 'compose', ...]
     */
    function functions(object) {
      var result = [];
      forIn(object, function(value, key) {
        if (isFunction(value)) {
          result.push(key);
        }
      });
      return result.sort();
    }

    /**
     * Checks if the specified object `property` exists and is a direct property,
     * instead of an inherited property.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The object to check.
     * @param {string} property The property to check for.
     * @returns {boolean} Returns `true` if key is a direct property, else `false`.
     * @example
     *
     * _.has({ 'a': 1, 'b': 2, 'c': 3 }, 'b');
     * // => true
     */
    function has(object, property) {
      return object ? hasOwnProperty.call(object, property) : false;
    }

    /**
     * Creates an object composed of the inverted keys and values of the given object.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The object to invert.
     * @returns {Object} Returns the created inverted object.
     * @example
     *
     *  _.invert({ 'first': 'fred', 'second': 'barney' });
     * // => { 'fred': 'first', 'barney': 'second' }
     */
    function invert(object) {
      var index = -1,
          props = keys(object),
          length = props.length,
          result = {};

      while (++index < length) {
        var key = props[index];
        result[object[key]] = key;
      }
      return result;
    }

    /**
     * Checks if `value` is a boolean value.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is a boolean value, else `false`.
     * @example
     *
     * _.isBoolean(null);
     * // => false
     */
    function isBoolean(value) {
      return value === true || value === false ||
        value && typeof value == 'object' && toString.call(value) == boolClass || false;
    }

    /**
     * Checks if `value` is a date.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is a date, else `false`.
     * @example
     *
     * _.isDate(new Date);
     * // => true
     */
    function isDate(value) {
      return value && typeof value == 'object' && toString.call(value) == dateClass || false;
    }

    /**
     * Checks if `value` is a DOM element.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is a DOM element, else `false`.
     * @example
     *
     * _.isElement(document.body);
     * // => true
     */
    function isElement(value) {
      return value && value.nodeType === 1 || false;
    }

    /**
     * Checks if `value` is empty. Arrays, strings, or `arguments` objects with a
     * length of `0` and objects with no own enumerable properties are considered
     * "empty".
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Array|Object|string} value The value to inspect.
     * @returns {boolean} Returns `true` if the `value` is empty, else `false`.
     * @example
     *
     * _.isEmpty([1, 2, 3]);
     * // => false
     *
     * _.isEmpty({});
     * // => true
     *
     * _.isEmpty('');
     * // => true
     */
    function isEmpty(value) {
      var result = true;
      if (!value) {
        return result;
      }
      var className = toString.call(value),
          length = value.length;

      if ((className == arrayClass || className == stringClass ||
          (support.argsClass ? className == argsClass : isArguments(value))) ||
          (className == objectClass && typeof length == 'number' && isFunction(value.splice))) {
        return !length;
      }
      forOwn(value, function() {
        return (result = false);
      });
      return result;
    }

    /**
     * Performs a deep comparison between two values to determine if they are
     * equivalent to each other. If a callback is provided it will be executed
     * to compare values. If the callback returns `undefined` comparisons will
     * be handled by the method instead. The callback is bound to `thisArg` and
     * invoked with two arguments; (a, b).
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} a The value to compare.
     * @param {*} b The other value to compare.
     * @param {Function} [callback] The function to customize comparing values.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
     * @example
     *
     * var object = { 'name': 'fred' };
     * var copy = { 'name': 'fred' };
     *
     * object == copy;
     * // => false
     *
     * _.isEqual(object, copy);
     * // => true
     *
     * var words = ['hello', 'goodbye'];
     * var otherWords = ['hi', 'goodbye'];
     *
     * _.isEqual(words, otherWords, function(a, b) {
     *   var reGreet = /^(?:hello|hi)$/i,
     *       aGreet = _.isString(a) && reGreet.test(a),
     *       bGreet = _.isString(b) && reGreet.test(b);
     *
     *   return (aGreet || bGreet) ? (aGreet == bGreet) : undefined;
     * });
     * // => true
     */
    function isEqual(a, b, callback, thisArg) {
      return baseIsEqual(a, b, typeof callback == 'function' && baseCreateCallback(callback, thisArg, 2));
    }

    /**
     * Checks if `value` is, or can be coerced to, a finite number.
     *
     * Note: This is not the same as native `isFinite` which will return true for
     * booleans and empty strings. See http://es5.github.io/#x15.1.2.5.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is finite, else `false`.
     * @example
     *
     * _.isFinite(-101);
     * // => true
     *
     * _.isFinite('10');
     * // => true
     *
     * _.isFinite(true);
     * // => false
     *
     * _.isFinite('');
     * // => false
     *
     * _.isFinite(Infinity);
     * // => false
     */
    function isFinite(value) {
      return nativeIsFinite(value) && !nativeIsNaN(parseFloat(value));
    }

    /**
     * Checks if `value` is a function.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is a function, else `false`.
     * @example
     *
     * _.isFunction(_);
     * // => true
     */
    function isFunction(value) {
      return typeof value == 'function';
    }
    // fallback for older versions of Chrome and Safari
    if (isFunction(/x/)) {
      isFunction = function(value) {
        return typeof value == 'function' && toString.call(value) == funcClass;
      };
    }

    /**
     * Checks if `value` is the language type of Object.
     * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is an object, else `false`.
     * @example
     *
     * _.isObject({});
     * // => true
     *
     * _.isObject([1, 2, 3]);
     * // => true
     *
     * _.isObject(1);
     * // => false
     */
    function isObject(value) {
      // check if the value is the ECMAScript language type of Object
      // http://es5.github.io/#x8
      // and avoid a V8 bug
      // http://code.google.com/p/v8/issues/detail?id=2291
      return !!(value && objectTypes[typeof value]);
    }

    /**
     * Checks if `value` is `NaN`.
     *
     * Note: This is not the same as native `isNaN` which will return `true` for
     * `undefined` and other non-numeric values. See http://es5.github.io/#x15.1.2.4.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is `NaN`, else `false`.
     * @example
     *
     * _.isNaN(NaN);
     * // => true
     *
     * _.isNaN(new Number(NaN));
     * // => true
     *
     * isNaN(undefined);
     * // => true
     *
     * _.isNaN(undefined);
     * // => false
     */
    function isNaN(value) {
      // `NaN` as a primitive is the only value that is not equal to itself
      // (perform the [[Class]] check first to avoid errors with some host objects in IE)
      return isNumber(value) && value != +value;
    }

    /**
     * Checks if `value` is `null`.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is `null`, else `false`.
     * @example
     *
     * _.isNull(null);
     * // => true
     *
     * _.isNull(undefined);
     * // => false
     */
    function isNull(value) {
      return value === null;
    }

    /**
     * Checks if `value` is a number.
     *
     * Note: `NaN` is considered a number. See http://es5.github.io/#x8.5.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is a number, else `false`.
     * @example
     *
     * _.isNumber(8.4 * 5);
     * // => true
     */
    function isNumber(value) {
      return typeof value == 'number' ||
        value && typeof value == 'object' && toString.call(value) == numberClass || false;
    }

    /**
     * Checks if `value` is an object created by the `Object` constructor.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
     * @example
     *
     * function Shape() {
     *   this.x = 0;
     *   this.y = 0;
     * }
     *
     * _.isPlainObject(new Shape);
     * // => false
     *
     * _.isPlainObject([1, 2, 3]);
     * // => false
     *
     * _.isPlainObject({ 'x': 0, 'y': 0 });
     * // => true
     */
    var isPlainObject = !getPrototypeOf ? shimIsPlainObject : function(value) {
      if (!(value && toString.call(value) == objectClass) || (!support.argsClass && isArguments(value))) {
        return false;
      }
      var valueOf = value.valueOf,
          objProto = typeof valueOf == 'function' && (objProto = getPrototypeOf(valueOf)) && getPrototypeOf(objProto);

      return objProto
        ? (value == objProto || getPrototypeOf(value) == objProto)
        : shimIsPlainObject(value);
    };

    /**
     * Checks if `value` is a regular expression.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is a regular expression, else `false`.
     * @example
     *
     * _.isRegExp(/fred/);
     * // => true
     */
    function isRegExp(value) {
      return value && objectTypes[typeof value] && toString.call(value) == regexpClass || false;
    }

    /**
     * Checks if `value` is a string.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is a string, else `false`.
     * @example
     *
     * _.isString('fred');
     * // => true
     */
    function isString(value) {
      return typeof value == 'string' ||
        value && typeof value == 'object' && toString.call(value) == stringClass || false;
    }

    /**
     * Checks if `value` is `undefined`.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if the `value` is `undefined`, else `false`.
     * @example
     *
     * _.isUndefined(void 0);
     * // => true
     */
    function isUndefined(value) {
      return typeof value == 'undefined';
    }

    /**
     * Recursively merges own enumerable properties of the source object(s), that
     * don't resolve to `undefined` into the destination object. Subsequent sources
     * will overwrite property assignments of previous sources. If a callback is
     * provided it will be executed to produce the merged values of the destination
     * and source properties. If the callback returns `undefined` merging will
     * be handled by the method instead. The callback is bound to `thisArg` and
     * invoked with two arguments; (objectValue, sourceValue).
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The destination object.
     * @param {...Object} [source] The source objects.
     * @param {Function} [callback] The function to customize merging properties.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Object} Returns the destination object.
     * @example
     *
     * var names = {
     *   'characters': [
     *     { 'name': 'barney' },
     *     { 'name': 'fred' }
     *   ]
     * };
     *
     * var ages = {
     *   'characters': [
     *     { 'age': 36 },
     *     { 'age': 40 }
     *   ]
     * };
     *
     * _.merge(names, ages);
     * // => { 'characters': [{ 'name': 'barney', 'age': 36 }, { 'name': 'fred', 'age': 40 }] }
     *
     * var food = {
     *   'fruits': ['apple'],
     *   'vegetables': ['beet']
     * };
     *
     * var otherFood = {
     *   'fruits': ['banana'],
     *   'vegetables': ['carrot']
     * };
     *
     * _.merge(food, otherFood, function(a, b) {
     *   return _.isArray(a) ? a.concat(b) : undefined;
     * });
     * // => { 'fruits': ['apple', 'banana'], 'vegetables': ['beet', 'carrot] }
     */
    function merge(object) {
      var args = arguments,
          length = 2;

      if (!isObject(object)) {
        return object;
      }

      // allows working with `_.reduce` and `_.reduceRight` without using
      // their `index` and `collection` arguments
      if (typeof args[2] != 'number') {
        length = args.length;
      }
      if (length > 3 && typeof args[length - 2] == 'function') {
        var callback = baseCreateCallback(args[--length - 1], args[length--], 2);
      } else if (length > 2 && typeof args[length - 1] == 'function') {
        callback = args[--length];
      }
      var sources = slice(arguments, 1, length),
          index = -1,
          stackA = getArray(),
          stackB = getArray();

      while (++index < length) {
        baseMerge(object, sources[index], callback, stackA, stackB);
      }
      releaseArray(stackA);
      releaseArray(stackB);
      return object;
    }

    /**
     * Creates a shallow clone of `object` excluding the specified properties.
     * Property names may be specified as individual arguments or as arrays of
     * property names. If a callback is provided it will be executed for each
     * property of `object` omitting the properties the callback returns truey
     * for. The callback is bound to `thisArg` and invoked with three arguments;
     * (value, key, object).
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The source object.
     * @param {Function|...string|string[]} [callback] The properties to omit or the
     *  function called per iteration.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Object} Returns an object without the omitted properties.
     * @example
     *
     * _.omit({ 'name': 'fred', 'age': 40 }, 'age');
     * // => { 'name': 'fred' }
     *
     * _.omit({ 'name': 'fred', 'age': 40 }, function(value) {
     *   return typeof value == 'number';
     * });
     * // => { 'name': 'fred' }
     */
    function omit(object, callback, thisArg) {
      var result = {};
      if (typeof callback != 'function') {
        var props = [];
        forIn(object, function(value, key) {
          props.push(key);
        });
        props = baseDifference(props, baseFlatten(arguments, true, false, 1));

        var index = -1,
            length = props.length;

        while (++index < length) {
          var key = props[index];
          result[key] = object[key];
        }
      } else {
        callback = lodash.createCallback(callback, thisArg, 3);
        forIn(object, function(value, key, object) {
          if (!callback(value, key, object)) {
            result[key] = value;
          }
        });
      }
      return result;
    }

    /**
     * Creates a two dimensional array of an object's key-value pairs,
     * i.e. `[[key1, value1], [key2, value2]]`.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The object to inspect.
     * @returns {Array} Returns new array of key-value pairs.
     * @example
     *
     * _.pairs({ 'barney': 36, 'fred': 40 });
     * // => [['barney', 36], ['fred', 40]] (property order is not guaranteed across environments)
     */
    function pairs(object) {
      var index = -1,
          props = keys(object),
          length = props.length,
          result = Array(length);

      while (++index < length) {
        var key = props[index];
        result[index] = [key, object[key]];
      }
      return result;
    }

    /**
     * Creates a shallow clone of `object` composed of the specified properties.
     * Property names may be specified as individual arguments or as arrays of
     * property names. If a callback is provided it will be executed for each
     * property of `object` picking the properties the callback returns truey
     * for. The callback is bound to `thisArg` and invoked with three arguments;
     * (value, key, object).
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The source object.
     * @param {Function|...string|string[]} [callback] The function called per
     *  iteration or property names to pick, specified as individual property
     *  names or arrays of property names.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Object} Returns an object composed of the picked properties.
     * @example
     *
     * _.pick({ 'name': 'fred', '_userid': 'fred1' }, 'name');
     * // => { 'name': 'fred' }
     *
     * _.pick({ 'name': 'fred', '_userid': 'fred1' }, function(value, key) {
     *   return key.charAt(0) != '_';
     * });
     * // => { 'name': 'fred' }
     */
    function pick(object, callback, thisArg) {
      var result = {};
      if (typeof callback != 'function') {
        var index = -1,
            props = baseFlatten(arguments, true, false, 1),
            length = isObject(object) ? props.length : 0;

        while (++index < length) {
          var key = props[index];
          if (key in object) {
            result[key] = object[key];
          }
        }
      } else {
        callback = lodash.createCallback(callback, thisArg, 3);
        forIn(object, function(value, key, object) {
          if (callback(value, key, object)) {
            result[key] = value;
          }
        });
      }
      return result;
    }

    /**
     * An alternative to `_.reduce` this method transforms `object` to a new
     * `accumulator` object which is the result of running each of its elements
     * through a callback, with each callback execution potentially mutating
     * the `accumulator` object. The callback is bound to `thisArg` and invoked
     * with four arguments; (accumulator, value, key, object). Callbacks may exit
     * iteration early by explicitly returning `false`.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Array|Object} object The object to iterate over.
     * @param {Function} [callback=identity] The function called per iteration.
     * @param {*} [accumulator] The custom accumulator value.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {*} Returns the accumulated value.
     * @example
     *
     * var squares = _.transform([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], function(result, num) {
     *   num *= num;
     *   if (num % 2) {
     *     return result.push(num) < 3;
     *   }
     * });
     * // => [1, 9, 25]
     *
     * var mapped = _.transform({ 'a': 1, 'b': 2, 'c': 3 }, function(result, num, key) {
     *   result[key] = num * 3;
     * });
     * // => { 'a': 3, 'b': 6, 'c': 9 }
     */
    function transform(object, callback, accumulator, thisArg) {
      var isArr = isArray(object);
      if (accumulator == null) {
        if (isArr) {
          accumulator = [];
        } else {
          var ctor = object && object.constructor,
              proto = ctor && ctor.prototype;

          accumulator = baseCreate(proto);
        }
      }
      if (callback) {
        callback = lodash.createCallback(callback, thisArg, 4);
        (isArr ? baseEach : forOwn)(object, function(value, index, object) {
          return callback(accumulator, value, index, object);
        });
      }
      return accumulator;
    }

    /**
     * Creates an array composed of the own enumerable property values of `object`.
     *
     * @static
     * @memberOf _
     * @category Objects
     * @param {Object} object The object to inspect.
     * @returns {Array} Returns an array of property values.
     * @example
     *
     * _.values({ 'one': 1, 'two': 2, 'three': 3 });
     * // => [1, 2, 3] (property order is not guaranteed across environments)
     */
    function values(object) {
      var index = -1,
          props = keys(object),
          length = props.length,
          result = Array(length);

      while (++index < length) {
        result[index] = object[props[index]];
      }
      return result;
    }

    /*--------------------------------------------------------------------------*/

    /**
     * Creates an array of elements from the specified indexes, or keys, of the
     * `collection`. Indexes may be specified as individual arguments or as arrays
     * of indexes.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {...(number|number[]|string|string[])} [index] The indexes of `collection`
     *   to retrieve, specified as individual indexes or arrays of indexes.
     * @returns {Array} Returns a new array of elements corresponding to the
     *  provided indexes.
     * @example
     *
     * _.at(['a', 'b', 'c', 'd', 'e'], [0, 2, 4]);
     * // => ['a', 'c', 'e']
     *
     * _.at(['fred', 'barney', 'pebbles'], 0, 2);
     * // => ['fred', 'pebbles']
     */
    function at(collection) {
      var args = arguments,
          index = -1,
          props = baseFlatten(args, true, false, 1),
          length = (args[2] && args[2][args[1]] === collection) ? 1 : props.length,
          result = Array(length);

      if (support.unindexedChars && isString(collection)) {
        collection = collection.split('');
      }
      while(++index < length) {
        result[index] = collection[props[index]];
      }
      return result;
    }

    /**
     * Checks if a given value is present in a collection using strict equality
     * for comparisons, i.e. `===`. If `fromIndex` is negative, it is used as the
     * offset from the end of the collection.
     *
     * @static
     * @memberOf _
     * @alias include
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {*} target The value to check for.
     * @param {number} [fromIndex=0] The index to search from.
     * @returns {boolean} Returns `true` if the `target` element is found, else `false`.
     * @example
     *
     * _.contains([1, 2, 3], 1);
     * // => true
     *
     * _.contains([1, 2, 3], 1, 2);
     * // => false
     *
     * _.contains({ 'name': 'fred', 'age': 40 }, 'fred');
     * // => true
     *
     * _.contains('pebbles', 'eb');
     * // => true
     */
    function contains(collection, target, fromIndex) {
      var index = -1,
          indexOf = getIndexOf(),
          length = collection ? collection.length : 0,
          result = false;

      fromIndex = (fromIndex < 0 ? nativeMax(0, length + fromIndex) : fromIndex) || 0;
      if (isArray(collection)) {
        result = indexOf(collection, target, fromIndex) > -1;
      } else if (typeof length == 'number') {
        result = (isString(collection) ? collection.indexOf(target, fromIndex) : indexOf(collection, target, fromIndex)) > -1;
      } else {
        baseEach(collection, function(value) {
          if (++index >= fromIndex) {
            return !(result = value === target);
          }
        });
      }
      return result;
    }

    /**
     * Creates an object composed of keys generated from the results of running
     * each element of `collection` through the callback. The corresponding value
     * of each key is the number of times the key was returned by the callback.
     * The callback is bound to `thisArg` and invoked with three arguments;
     * (value, index|key, collection).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Object} Returns the composed aggregate object.
     * @example
     *
     * _.countBy([4.3, 6.1, 6.4], function(num) { return Math.floor(num); });
     * // => { '4': 1, '6': 2 }
     *
     * _.countBy([4.3, 6.1, 6.4], function(num) { return this.floor(num); }, Math);
     * // => { '4': 1, '6': 2 }
     *
     * _.countBy(['one', 'two', 'three'], 'length');
     * // => { '3': 2, '5': 1 }
     */
    var countBy = createAggregator(function(result, value, key) {
      (hasOwnProperty.call(result, key) ? result[key]++ : result[key] = 1);
    });

    /**
     * Checks if the given callback returns truey value for **all** elements of
     * a collection. The callback is bound to `thisArg` and invoked with three
     * arguments; (value, index|key, collection).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @alias all
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {boolean} Returns `true` if all elements passed the callback check,
     *  else `false`.
     * @example
     *
     * _.every([true, 1, null, 'yes']);
     * // => false
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36 },
     *   { 'name': 'fred',   'age': 40 }
     * ];
     *
     * // using "_.pluck" callback shorthand
     * _.every(characters, 'age');
     * // => true
     *
     * // using "_.where" callback shorthand
     * _.every(characters, { 'age': 36 });
     * // => false
     */
    function every(collection, callback, thisArg) {
      var result = true;
      callback = lodash.createCallback(callback, thisArg, 3);

      if (isArray(collection)) {
        var index = -1,
            length = collection.length;

        while (++index < length) {
          if (!(result = !!callback(collection[index], index, collection))) {
            break;
          }
        }
      } else {
        baseEach(collection, function(value, index, collection) {
          return (result = !!callback(value, index, collection));
        });
      }
      return result;
    }

    /**
     * Iterates over elements of a collection, returning an array of all elements
     * the callback returns truey for. The callback is bound to `thisArg` and
     * invoked with three arguments; (value, index|key, collection).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @alias select
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array} Returns a new array of elements that passed the callback check.
     * @example
     *
     * var evens = _.filter([1, 2, 3, 4, 5, 6], function(num) { return num % 2 == 0; });
     * // => [2, 4, 6]
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36, 'blocked': false },
     *   { 'name': 'fred',   'age': 40, 'blocked': true }
     * ];
     *
     * // using "_.pluck" callback shorthand
     * _.filter(characters, 'blocked');
     * // => [{ 'name': 'fred', 'age': 40, 'blocked': true }]
     *
     * // using "_.where" callback shorthand
     * _.filter(characters, { 'age': 36 });
     * // => [{ 'name': 'barney', 'age': 36, 'blocked': false }]
     */
    function filter(collection, callback, thisArg) {
      var result = [];
      callback = lodash.createCallback(callback, thisArg, 3);

      if (isArray(collection)) {
        var index = -1,
            length = collection.length;

        while (++index < length) {
          var value = collection[index];
          if (callback(value, index, collection)) {
            result.push(value);
          }
        }
      } else {
        baseEach(collection, function(value, index, collection) {
          if (callback(value, index, collection)) {
            result.push(value);
          }
        });
      }
      return result;
    }

    /**
     * Iterates over elements of a collection, returning the first element that
     * the callback returns truey for. The callback is bound to `thisArg` and
     * invoked with three arguments; (value, index|key, collection).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @alias detect, findWhere
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {*} Returns the found element, else `undefined`.
     * @example
     *
     * var characters = [
     *   { 'name': 'barney',  'age': 36, 'blocked': false },
     *   { 'name': 'fred',    'age': 40, 'blocked': true },
     *   { 'name': 'pebbles', 'age': 1,  'blocked': false }
     * ];
     *
     * _.find(characters, function(chr) {
     *   return chr.age < 40;
     * });
     * // => { 'name': 'barney', 'age': 36, 'blocked': false }
     *
     * // using "_.where" callback shorthand
     * _.find(characters, { 'age': 1 });
     * // =>  { 'name': 'pebbles', 'age': 1, 'blocked': false }
     *
     * // using "_.pluck" callback shorthand
     * _.find(characters, 'blocked');
     * // => { 'name': 'fred', 'age': 40, 'blocked': true }
     */
    function find(collection, callback, thisArg) {
      callback = lodash.createCallback(callback, thisArg, 3);

      if (isArray(collection)) {
        var index = -1,
            length = collection.length;

        while (++index < length) {
          var value = collection[index];
          if (callback(value, index, collection)) {
            return value;
          }
        }
      } else {
        var result;
        baseEach(collection, function(value, index, collection) {
          if (callback(value, index, collection)) {
            result = value;
            return false;
          }
        });
        return result;
      }
    }

    /**
     * This method is like `_.find` except that it iterates over elements
     * of a `collection` from right to left.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {*} Returns the found element, else `undefined`.
     * @example
     *
     * _.findLast([1, 2, 3, 4], function(num) {
     *   return num % 2 == 1;
     * });
     * // => 3
     */
    function findLast(collection, callback, thisArg) {
      var result;
      callback = lodash.createCallback(callback, thisArg, 3);
      forEachRight(collection, function(value, index, collection) {
        if (callback(value, index, collection)) {
          result = value;
          return false;
        }
      });
      return result;
    }

    /**
     * Iterates over elements of a collection, executing the callback for each
     * element. The callback is bound to `thisArg` and invoked with three arguments;
     * (value, index|key, collection). Callbacks may exit iteration early by
     * explicitly returning `false`.
     *
     * Note: As with other "Collections" methods, objects with a `length` property
     * are iterated like arrays. To avoid this behavior `_.forIn` or `_.forOwn`
     * may be used for object iteration.
     *
     * @static
     * @memberOf _
     * @alias each
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function} [callback=identity] The function called per iteration.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array|Object|string} Returns `collection`.
     * @example
     *
     * _([1, 2, 3]).forEach(function(num) { console.log(num); }).join(',');
     * // => logs each number and returns '1,2,3'
     *
     * _.forEach({ 'one': 1, 'two': 2, 'three': 3 }, function(num) { console.log(num); });
     * // => logs each number and returns the object (property order is not guaranteed across environments)
     */
    function forEach(collection, callback, thisArg) {
      if (callback && typeof thisArg == 'undefined' && isArray(collection)) {
        var index = -1,
            length = collection.length;

        while (++index < length) {
          if (callback(collection[index], index, collection) === false) {
            break;
          }
        }
      } else {
        baseEach(collection, callback, thisArg);
      }
      return collection;
    }

    /**
     * This method is like `_.forEach` except that it iterates over elements
     * of a `collection` from right to left.
     *
     * @static
     * @memberOf _
     * @alias eachRight
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function} [callback=identity] The function called per iteration.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array|Object|string} Returns `collection`.
     * @example
     *
     * _([1, 2, 3]).forEachRight(function(num) { console.log(num); }).join(',');
     * // => logs each number from right to left and returns '3,2,1'
     */
    function forEachRight(collection, callback, thisArg) {
      var iterable = collection,
          length = collection ? collection.length : 0;

      callback = callback && typeof thisArg == 'undefined' ? callback : baseCreateCallback(callback, thisArg, 3);
      if (isArray(collection)) {
        while (length--) {
          if (callback(collection[length], length, collection) === false) {
            break;
          }
        }
      } else {
        if (typeof length != 'number') {
          var props = keys(collection);
          length = props.length;
        } else if (support.unindexedChars && isString(collection)) {
          iterable = collection.split('');
        }
        baseEach(collection, function(value, key, collection) {
          key = props ? props[--length] : --length;
          return callback(iterable[key], key, collection);
        });
      }
      return collection;
    }

    /**
     * Creates an object composed of keys generated from the results of running
     * each element of a collection through the callback. The corresponding value
     * of each key is an array of the elements responsible for generating the key.
     * The callback is bound to `thisArg` and invoked with three arguments;
     * (value, index|key, collection).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Object} Returns the composed aggregate object.
     * @example
     *
     * _.groupBy([4.2, 6.1, 6.4], function(num) { return Math.floor(num); });
     * // => { '4': [4.2], '6': [6.1, 6.4] }
     *
     * _.groupBy([4.2, 6.1, 6.4], function(num) { return this.floor(num); }, Math);
     * // => { '4': [4.2], '6': [6.1, 6.4] }
     *
     * // using "_.pluck" callback shorthand
     * _.groupBy(['one', 'two', 'three'], 'length');
     * // => { '3': ['one', 'two'], '5': ['three'] }
     */
    var groupBy = createAggregator(function(result, value, key) {
      (hasOwnProperty.call(result, key) ? result[key] : result[key] = []).push(value);
    });

    /**
     * Creates an object composed of keys generated from the results of running
     * each element of the collection through the given callback. The corresponding
     * value of each key is the last element responsible for generating the key.
     * The callback is bound to `thisArg` and invoked with three arguments;
     * (value, index|key, collection).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Object} Returns the composed aggregate object.
     * @example
     *
     * var keys = [
     *   { 'dir': 'left', 'code': 97 },
     *   { 'dir': 'right', 'code': 100 }
     * ];
     *
     * _.indexBy(keys, 'dir');
     * // => { 'left': { 'dir': 'left', 'code': 97 }, 'right': { 'dir': 'right', 'code': 100 } }
     *
     * _.indexBy(keys, function(key) { return String.fromCharCode(key.code); });
     * // => { 'a': { 'dir': 'left', 'code': 97 }, 'd': { 'dir': 'right', 'code': 100 } }
     *
     * _.indexBy(characters, function(key) { this.fromCharCode(key.code); }, String);
     * // => { 'a': { 'dir': 'left', 'code': 97 }, 'd': { 'dir': 'right', 'code': 100 } }
     */
    var indexBy = createAggregator(function(result, value, key) {
      result[key] = value;
    });

    /**
     * Invokes the method named by `methodName` on each element in the `collection`
     * returning an array of the results of each invoked method. Additional arguments
     * will be provided to each invoked method. If `methodName` is a function it
     * will be invoked for, and `this` bound to, each element in the `collection`.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|string} methodName The name of the method to invoke or
     *  the function invoked per iteration.
     * @param {...*} [arg] Arguments to invoke the method with.
     * @returns {Array} Returns a new array of the results of each invoked method.
     * @example
     *
     * _.invoke([[5, 1, 7], [3, 2, 1]], 'sort');
     * // => [[1, 5, 7], [1, 2, 3]]
     *
     * _.invoke([123, 456], String.prototype.split, '');
     * // => [['1', '2', '3'], ['4', '5', '6']]
     */
    function invoke(collection, methodName) {
      var args = slice(arguments, 2),
          index = -1,
          isFunc = typeof methodName == 'function',
          length = collection ? collection.length : 0,
          result = Array(typeof length == 'number' ? length : 0);

      forEach(collection, function(value) {
        result[++index] = (isFunc ? methodName : value[methodName]).apply(value, args);
      });
      return result;
    }

    /**
     * Creates an array of values by running each element in the collection
     * through the callback. The callback is bound to `thisArg` and invoked with
     * three arguments; (value, index|key, collection).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @alias collect
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array} Returns a new array of the results of each `callback` execution.
     * @example
     *
     * _.map([1, 2, 3], function(num) { return num * 3; });
     * // => [3, 6, 9]
     *
     * _.map({ 'one': 1, 'two': 2, 'three': 3 }, function(num) { return num * 3; });
     * // => [3, 6, 9] (property order is not guaranteed across environments)
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36 },
     *   { 'name': 'fred',   'age': 40 }
     * ];
     *
     * // using "_.pluck" callback shorthand
     * _.map(characters, 'name');
     * // => ['barney', 'fred']
     */
    function map(collection, callback, thisArg) {
      var index = -1,
          length = collection ? collection.length : 0,
          result = Array(typeof length == 'number' ? length : 0);

      callback = lodash.createCallback(callback, thisArg, 3);
      if (isArray(collection)) {
        while (++index < length) {
          result[index] = callback(collection[index], index, collection);
        }
      } else {
        baseEach(collection, function(value, key, collection) {
          result[++index] = callback(value, key, collection);
        });
      }
      return result;
    }

    /**
     * Retrieves the maximum value of a collection. If the collection is empty or
     * falsey `-Infinity` is returned. If a callback is provided it will be executed
     * for each value in the collection to generate the criterion by which the value
     * is ranked. The callback is bound to `thisArg` and invoked with three
     * arguments; (value, index, collection).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {*} Returns the maximum value.
     * @example
     *
     * _.max([4, 2, 8, 6]);
     * // => 8
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36 },
     *   { 'name': 'fred',   'age': 40 }
     * ];
     *
     * _.max(characters, function(chr) { return chr.age; });
     * // => { 'name': 'fred', 'age': 40 };
     *
     * // using "_.pluck" callback shorthand
     * _.max(characters, 'age');
     * // => { 'name': 'fred', 'age': 40 };
     */
    function max(collection, callback, thisArg) {
      var computed = -Infinity,
          result = computed;

      // allows working with functions like `_.map` without using
      // their `index` argument as a callback
      if (typeof callback != 'function' && thisArg && thisArg[callback] === collection) {
        callback = null;
      }
      if (callback == null && isArray(collection)) {
        var index = -1,
            length = collection.length;

        while (++index < length) {
          var value = collection[index];
          if (value > result) {
            result = value;
          }
        }
      } else {
        callback = (callback == null && isString(collection))
          ? charAtCallback
          : lodash.createCallback(callback, thisArg, 3);

        baseEach(collection, function(value, index, collection) {
          var current = callback(value, index, collection);
          if (current > computed) {
            computed = current;
            result = value;
          }
        });
      }
      return result;
    }

    /**
     * Retrieves the minimum value of a collection. If the collection is empty or
     * falsey `Infinity` is returned. If a callback is provided it will be executed
     * for each value in the collection to generate the criterion by which the value
     * is ranked. The callback is bound to `thisArg` and invoked with three
     * arguments; (value, index, collection).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {*} Returns the minimum value.
     * @example
     *
     * _.min([4, 2, 8, 6]);
     * // => 2
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36 },
     *   { 'name': 'fred',   'age': 40 }
     * ];
     *
     * _.min(characters, function(chr) { return chr.age; });
     * // => { 'name': 'barney', 'age': 36 };
     *
     * // using "_.pluck" callback shorthand
     * _.min(characters, 'age');
     * // => { 'name': 'barney', 'age': 36 };
     */
    function min(collection, callback, thisArg) {
      var computed = Infinity,
          result = computed;

      // allows working with functions like `_.map` without using
      // their `index` argument as a callback
      if (typeof callback != 'function' && thisArg && thisArg[callback] === collection) {
        callback = null;
      }
      if (callback == null && isArray(collection)) {
        var index = -1,
            length = collection.length;

        while (++index < length) {
          var value = collection[index];
          if (value < result) {
            result = value;
          }
        }
      } else {
        callback = (callback == null && isString(collection))
          ? charAtCallback
          : lodash.createCallback(callback, thisArg, 3);

        baseEach(collection, function(value, index, collection) {
          var current = callback(value, index, collection);
          if (current < computed) {
            computed = current;
            result = value;
          }
        });
      }
      return result;
    }

    /**
     * Retrieves the value of a specified property from all elements in the collection.
     *
     * @static
     * @memberOf _
     * @type Function
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {string} property The property to pluck.
     * @returns {Array} Returns a new array of property values.
     * @example
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36 },
     *   { 'name': 'fred',   'age': 40 }
     * ];
     *
     * _.pluck(characters, 'name');
     * // => ['barney', 'fred']
     */
    var pluck = map;

    /**
     * Reduces a collection to a value which is the accumulated result of running
     * each element in the collection through the callback, where each successive
     * callback execution consumes the return value of the previous execution. If
     * `accumulator` is not provided the first element of the collection will be
     * used as the initial `accumulator` value. The callback is bound to `thisArg`
     * and invoked with four arguments; (accumulator, value, index|key, collection).
     *
     * @static
     * @memberOf _
     * @alias foldl, inject
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function} [callback=identity] The function called per iteration.
     * @param {*} [accumulator] Initial value of the accumulator.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {*} Returns the accumulated value.
     * @example
     *
     * var sum = _.reduce([1, 2, 3], function(sum, num) {
     *   return sum + num;
     * });
     * // => 6
     *
     * var mapped = _.reduce({ 'a': 1, 'b': 2, 'c': 3 }, function(result, num, key) {
     *   result[key] = num * 3;
     *   return result;
     * }, {});
     * // => { 'a': 3, 'b': 6, 'c': 9 }
     */
    function reduce(collection, callback, accumulator, thisArg) {
      var noaccum = arguments.length < 3;
      callback = lodash.createCallback(callback, thisArg, 4);

      if (isArray(collection)) {
        var index = -1,
            length = collection.length;

        if (noaccum) {
          accumulator = collection[++index];
        }
        while (++index < length) {
          accumulator = callback(accumulator, collection[index], index, collection);
        }
      } else {
        baseEach(collection, function(value, index, collection) {
          accumulator = noaccum
            ? (noaccum = false, value)
            : callback(accumulator, value, index, collection)
        });
      }
      return accumulator;
    }

    /**
     * This method is like `_.reduce` except that it iterates over elements
     * of a `collection` from right to left.
     *
     * @static
     * @memberOf _
     * @alias foldr
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function} [callback=identity] The function called per iteration.
     * @param {*} [accumulator] Initial value of the accumulator.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {*} Returns the accumulated value.
     * @example
     *
     * var list = [[0, 1], [2, 3], [4, 5]];
     * var flat = _.reduceRight(list, function(a, b) { return a.concat(b); }, []);
     * // => [4, 5, 2, 3, 0, 1]
     */
    function reduceRight(collection, callback, accumulator, thisArg) {
      var noaccum = arguments.length < 3;
      callback = lodash.createCallback(callback, thisArg, 4);
      forEachRight(collection, function(value, index, collection) {
        accumulator = noaccum
          ? (noaccum = false, value)
          : callback(accumulator, value, index, collection);
      });
      return accumulator;
    }

    /**
     * The opposite of `_.filter` this method returns the elements of a
     * collection that the callback does **not** return truey for.
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array} Returns a new array of elements that failed the callback check.
     * @example
     *
     * var odds = _.reject([1, 2, 3, 4, 5, 6], function(num) { return num % 2 == 0; });
     * // => [1, 3, 5]
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36, 'blocked': false },
     *   { 'name': 'fred',   'age': 40, 'blocked': true }
     * ];
     *
     * // using "_.pluck" callback shorthand
     * _.reject(characters, 'blocked');
     * // => [{ 'name': 'barney', 'age': 36, 'blocked': false }]
     *
     * // using "_.where" callback shorthand
     * _.reject(characters, { 'age': 36 });
     * // => [{ 'name': 'fred', 'age': 40, 'blocked': true }]
     */
    function reject(collection, callback, thisArg) {
      callback = lodash.createCallback(callback, thisArg, 3);
      return filter(collection, function(value, index, collection) {
        return !callback(value, index, collection);
      });
    }

    /**
     * Retrieves a random element or `n` random elements from a collection.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to sample.
     * @param {number} [n] The number of elements to sample.
     * @param- {Object} [guard] Allows working with functions like `_.map`
     *  without using their `index` arguments as `n`.
     * @returns {Array} Returns the random sample(s) of `collection`.
     * @example
     *
     * _.sample([1, 2, 3, 4]);
     * // => 2
     *
     * _.sample([1, 2, 3, 4], 2);
     * // => [3, 1]
     */
    function sample(collection, n, guard) {
      if (collection && typeof collection.length != 'number') {
        collection = values(collection);
      } else if (support.unindexedChars && isString(collection)) {
        collection = collection.split('');
      }
      if (n == null || guard) {
        return collection ? collection[baseRandom(0, collection.length - 1)] : undefined;
      }
      var result = shuffle(collection);
      result.length = nativeMin(nativeMax(0, n), result.length);
      return result;
    }

    /**
     * Creates an array of shuffled values, using a version of the Fisher-Yates
     * shuffle. See http://en.wikipedia.org/wiki/Fisher-Yates_shuffle.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to shuffle.
     * @returns {Array} Returns a new shuffled collection.
     * @example
     *
     * _.shuffle([1, 2, 3, 4, 5, 6]);
     * // => [4, 1, 6, 3, 5, 2]
     */
    function shuffle(collection) {
      var index = -1,
          length = collection ? collection.length : 0,
          result = Array(typeof length == 'number' ? length : 0);

      forEach(collection, function(value) {
        var rand = baseRandom(0, ++index);
        result[index] = result[rand];
        result[rand] = value;
      });
      return result;
    }

    /**
     * Gets the size of the `collection` by returning `collection.length` for arrays
     * and array-like objects or the number of own enumerable properties for objects.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to inspect.
     * @returns {number} Returns `collection.length` or number of own enumerable properties.
     * @example
     *
     * _.size([1, 2]);
     * // => 2
     *
     * _.size({ 'one': 1, 'two': 2, 'three': 3 });
     * // => 3
     *
     * _.size('pebbles');
     * // => 5
     */
    function size(collection) {
      var length = collection ? collection.length : 0;
      return typeof length == 'number' ? length : keys(collection).length;
    }

    /**
     * Checks if the callback returns a truey value for **any** element of a
     * collection. The function returns as soon as it finds a passing value and
     * does not iterate over the entire collection. The callback is bound to
     * `thisArg` and invoked with three arguments; (value, index|key, collection).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @alias any
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {boolean} Returns `true` if any element passed the callback check,
     *  else `false`.
     * @example
     *
     * _.some([null, 0, 'yes', false], Boolean);
     * // => true
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36, 'blocked': false },
     *   { 'name': 'fred',   'age': 40, 'blocked': true }
     * ];
     *
     * // using "_.pluck" callback shorthand
     * _.some(characters, 'blocked');
     * // => true
     *
     * // using "_.where" callback shorthand
     * _.some(characters, { 'age': 1 });
     * // => false
     */
    function some(collection, callback, thisArg) {
      var result;
      callback = lodash.createCallback(callback, thisArg, 3);

      if (isArray(collection)) {
        var index = -1,
            length = collection.length;

        while (++index < length) {
          if ((result = callback(collection[index], index, collection))) {
            break;
          }
        }
      } else {
        baseEach(collection, function(value, index, collection) {
          return !(result = callback(value, index, collection));
        });
      }
      return !!result;
    }

    /**
     * Creates an array of elements, sorted in ascending order by the results of
     * running each element in a collection through the callback. This method
     * performs a stable sort, that is, it will preserve the original sort order
     * of equal elements. The callback is bound to `thisArg` and invoked with
     * three arguments; (value, index|key, collection).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array} Returns a new array of sorted elements.
     * @example
     *
     * _.sortBy([1, 2, 3], function(num) { return Math.sin(num); });
     * // => [3, 1, 2]
     *
     * _.sortBy([1, 2, 3], function(num) { return this.sin(num); }, Math);
     * // => [3, 1, 2]
     *
     * // using "_.pluck" callback shorthand
     * _.sortBy(['banana', 'strawberry', 'apple'], 'length');
     * // => ['apple', 'banana', 'strawberry']
     */
    function sortBy(collection, callback, thisArg) {
      var index = -1,
          length = collection ? collection.length : 0,
          result = Array(typeof length == 'number' ? length : 0);

      callback = lodash.createCallback(callback, thisArg, 3);
      forEach(collection, function(value, key, collection) {
        var object = result[++index] = getObject();
        object.criteria = callback(value, key, collection);
        object.index = index;
        object.value = value;
      });

      length = result.length;
      result.sort(compareAscending);
      while (length--) {
        var object = result[length];
        result[length] = object.value;
        releaseObject(object);
      }
      return result;
    }

    /**
     * Converts the `collection` to an array.
     *
     * @static
     * @memberOf _
     * @category Collections
     * @param {Array|Object|string} collection The collection to convert.
     * @returns {Array} Returns the new converted array.
     * @example
     *
     * (function() { return _.toArray(arguments).slice(1); })(1, 2, 3, 4);
     * // => [2, 3, 4]
     */
    function toArray(collection) {
      if (collection && typeof collection.length == 'number') {
        return (support.unindexedChars && isString(collection))
          ? collection.split('')
          : slice(collection);
      }
      return values(collection);
    }

    /**
     * Performs a deep comparison of each element in a `collection` to the given
     * `properties` object, returning an array of all elements that have equivalent
     * property values.
     *
     * @static
     * @memberOf _
     * @type Function
     * @category Collections
     * @param {Array|Object|string} collection The collection to iterate over.
     * @param {Object} properties The object of property values to filter by.
     * @returns {Array} Returns a new array of elements that have the given properties.
     * @example
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36, 'pets': ['hoppy'] },
     *   { 'name': 'fred',   'age': 40, 'pets': ['baby puss', 'dino'] }
     * ];
     *
     * _.where(characters, { 'age': 36 });
     * // => [{ 'name': 'barney', 'age': 36, 'pets': ['hoppy'] }]
     *
     * _.where(characters, { 'pets': ['dino'] });
     * // => [{ 'name': 'fred', 'age': 40, 'pets': ['baby puss', 'dino'] }]
     */
    var where = filter;

    /*--------------------------------------------------------------------------*/

    /**
     * Creates an array with all falsey values removed. The values `false`, `null`,
     * `0`, `""`, `undefined`, and `NaN` are all falsey.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to compact.
     * @returns {Array} Returns a new array of filtered values.
     * @example
     *
     * _.compact([0, 1, false, 2, '', 3]);
     * // => [1, 2, 3]
     */
    function compact(array) {
      var index = -1,
          length = array ? array.length : 0,
          result = [];

      while (++index < length) {
        var value = array[index];
        if (value) {
          result.push(value);
        }
      }
      return result;
    }

    /**
     * Creates an array excluding all values of the provided arrays using strict
     * equality for comparisons, i.e. `===`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to process.
     * @param {...Array} [values] The arrays of values to exclude.
     * @returns {Array} Returns a new array of filtered values.
     * @example
     *
     * _.difference([1, 2, 3, 4, 5], [5, 2, 10]);
     * // => [1, 3, 4]
     */
    function difference(array) {
      return baseDifference(array, baseFlatten(arguments, true, true, 1));
    }

    /**
     * This method is like `_.find` except that it returns the index of the first
     * element that passes the callback check, instead of the element itself.
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to search.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {number} Returns the index of the found element, else `-1`.
     * @example
     *
     * var characters = [
     *   { 'name': 'barney',  'age': 36, 'blocked': false },
     *   { 'name': 'fred',    'age': 40, 'blocked': true },
     *   { 'name': 'pebbles', 'age': 1,  'blocked': false }
     * ];
     *
     * _.findIndex(characters, function(chr) {
     *   return chr.age < 20;
     * });
     * // => 2
     *
     * // using "_.where" callback shorthand
     * _.findIndex(characters, { 'age': 36 });
     * // => 0
     *
     * // using "_.pluck" callback shorthand
     * _.findIndex(characters, 'blocked');
     * // => 1
     */
    function findIndex(array, callback, thisArg) {
      var index = -1,
          length = array ? array.length : 0;

      callback = lodash.createCallback(callback, thisArg, 3);
      while (++index < length) {
        if (callback(array[index], index, array)) {
          return index;
        }
      }
      return -1;
    }

    /**
     * This method is like `_.findIndex` except that it iterates over elements
     * of a `collection` from right to left.
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to search.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {number} Returns the index of the found element, else `-1`.
     * @example
     *
     * var characters = [
     *   { 'name': 'barney',  'age': 36, 'blocked': true },
     *   { 'name': 'fred',    'age': 40, 'blocked': false },
     *   { 'name': 'pebbles', 'age': 1,  'blocked': true }
     * ];
     *
     * _.findLastIndex(characters, function(chr) {
     *   return chr.age > 30;
     * });
     * // => 1
     *
     * // using "_.where" callback shorthand
     * _.findLastIndex(characters, { 'age': 36 });
     * // => 0
     *
     * // using "_.pluck" callback shorthand
     * _.findLastIndex(characters, 'blocked');
     * // => 2
     */
    function findLastIndex(array, callback, thisArg) {
      var length = array ? array.length : 0;
      callback = lodash.createCallback(callback, thisArg, 3);
      while (length--) {
        if (callback(array[length], length, array)) {
          return length;
        }
      }
      return -1;
    }

    /**
     * Gets the first element or first `n` elements of an array. If a callback
     * is provided elements at the beginning of the array are returned as long
     * as the callback returns truey. The callback is bound to `thisArg` and
     * invoked with three arguments; (value, index, array).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @alias head, take
     * @category Arrays
     * @param {Array} array The array to query.
     * @param {Function|Object|number|string} [callback] The function called
     *  per element or the number of elements to return. If a property name or
     *  object is provided it will be used to create a "_.pluck" or "_.where"
     *  style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {*} Returns the first element(s) of `array`.
     * @example
     *
     * _.first([1, 2, 3]);
     * // => 1
     *
     * _.first([1, 2, 3], 2);
     * // => [1, 2]
     *
     * _.first([1, 2, 3], function(num) {
     *   return num < 3;
     * });
     * // => [1, 2]
     *
     * var characters = [
     *   { 'name': 'barney',  'blocked': true,  'employer': 'slate' },
     *   { 'name': 'fred',    'blocked': false, 'employer': 'slate' },
     *   { 'name': 'pebbles', 'blocked': true,  'employer': 'na' }
     * ];
     *
     * // using "_.pluck" callback shorthand
     * _.first(characters, 'blocked');
     * // => [{ 'name': 'barney', 'blocked': true, 'employer': 'slate' }]
     *
     * // using "_.where" callback shorthand
     * _.pluck(_.first(characters, { 'employer': 'slate' }), 'name');
     * // => ['barney', 'fred']
     */
    function first(array, callback, thisArg) {
      var n = 0,
          length = array ? array.length : 0;

      if (typeof callback != 'number' && callback != null) {
        var index = -1;
        callback = lodash.createCallback(callback, thisArg, 3);
        while (++index < length && callback(array[index], index, array)) {
          n++;
        }
      } else {
        n = callback;
        if (n == null || thisArg) {
          return array ? array[0] : undefined;
        }
      }
      return slice(array, 0, nativeMin(nativeMax(0, n), length));
    }

    /**
     * Flattens a nested array (the nesting can be to any depth). If `isShallow`
     * is truey, the array will only be flattened a single level. If a callback
     * is provided each element of the array is passed through the callback before
     * flattening. The callback is bound to `thisArg` and invoked with three
     * arguments; (value, index, array).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to flatten.
     * @param {boolean} [isShallow=false] A flag to restrict flattening to a single level.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array} Returns a new flattened array.
     * @example
     *
     * _.flatten([1, [2], [3, [[4]]]]);
     * // => [1, 2, 3, 4];
     *
     * _.flatten([1, [2], [3, [[4]]]], true);
     * // => [1, 2, 3, [[4]]];
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 30, 'pets': ['hoppy'] },
     *   { 'name': 'fred',   'age': 40, 'pets': ['baby puss', 'dino'] }
     * ];
     *
     * // using "_.pluck" callback shorthand
     * _.flatten(characters, 'pets');
     * // => ['hoppy', 'baby puss', 'dino']
     */
    function flatten(array, isShallow, callback, thisArg) {
      // juggle arguments
      if (typeof isShallow != 'boolean' && isShallow != null) {
        thisArg = callback;
        callback = (typeof isShallow != 'function' && thisArg && thisArg[isShallow] === array) ? null : isShallow;
        isShallow = false;
      }
      if (callback != null) {
        array = map(array, callback, thisArg);
      }
      return baseFlatten(array, isShallow);
    }

    /**
     * Gets the index at which the first occurrence of `value` is found using
     * strict equality for comparisons, i.e. `===`. If the array is already sorted
     * providing `true` for `fromIndex` will run a faster binary search.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to search.
     * @param {*} value The value to search for.
     * @param {boolean|number} [fromIndex=0] The index to search from or `true`
     *  to perform a binary search on a sorted array.
     * @returns {number} Returns the index of the matched value or `-1`.
     * @example
     *
     * _.indexOf([1, 2, 3, 1, 2, 3], 2);
     * // => 1
     *
     * _.indexOf([1, 2, 3, 1, 2, 3], 2, 3);
     * // => 4
     *
     * _.indexOf([1, 1, 2, 2, 3, 3], 2, true);
     * // => 2
     */
    function indexOf(array, value, fromIndex) {
      if (typeof fromIndex == 'number') {
        var length = array ? array.length : 0;
        fromIndex = (fromIndex < 0 ? nativeMax(0, length + fromIndex) : fromIndex || 0);
      } else if (fromIndex) {
        var index = sortedIndex(array, value);
        return array[index] === value ? index : -1;
      }
      return baseIndexOf(array, value, fromIndex);
    }

    /**
     * Gets all but the last element or last `n` elements of an array. If a
     * callback is provided elements at the end of the array are excluded from
     * the result as long as the callback returns truey. The callback is bound
     * to `thisArg` and invoked with three arguments; (value, index, array).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to query.
     * @param {Function|Object|number|string} [callback=1] The function called
     *  per element or the number of elements to exclude. If a property name or
     *  object is provided it will be used to create a "_.pluck" or "_.where"
     *  style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array} Returns a slice of `array`.
     * @example
     *
     * _.initial([1, 2, 3]);
     * // => [1, 2]
     *
     * _.initial([1, 2, 3], 2);
     * // => [1]
     *
     * _.initial([1, 2, 3], function(num) {
     *   return num > 1;
     * });
     * // => [1]
     *
     * var characters = [
     *   { 'name': 'barney',  'blocked': false, 'employer': 'slate' },
     *   { 'name': 'fred',    'blocked': true,  'employer': 'slate' },
     *   { 'name': 'pebbles', 'blocked': true,  'employer': 'na' }
     * ];
     *
     * // using "_.pluck" callback shorthand
     * _.initial(characters, 'blocked');
     * // => [{ 'name': 'barney',  'blocked': false, 'employer': 'slate' }]
     *
     * // using "_.where" callback shorthand
     * _.pluck(_.initial(characters, { 'employer': 'na' }), 'name');
     * // => ['barney', 'fred']
     */
    function initial(array, callback, thisArg) {
      var n = 0,
          length = array ? array.length : 0;

      if (typeof callback != 'number' && callback != null) {
        var index = length;
        callback = lodash.createCallback(callback, thisArg, 3);
        while (index-- && callback(array[index], index, array)) {
          n++;
        }
      } else {
        n = (callback == null || thisArg) ? 1 : callback || n;
      }
      return slice(array, 0, nativeMin(nativeMax(0, length - n), length));
    }

    /**
     * Creates an array of unique values present in all provided arrays using
     * strict equality for comparisons, i.e. `===`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {...Array} [array] The arrays to inspect.
     * @returns {Array} Returns an array of composite values.
     * @example
     *
     * _.intersection([1, 2, 3], [101, 2, 1, 10], [2, 1]);
     * // => [1, 2]
     */
    function intersection(array) {
      var args = arguments,
          argsLength = args.length,
          argsIndex = -1,
          caches = getArray(),
          index = -1,
          indexOf = getIndexOf(),
          length = array ? array.length : 0,
          result = [],
          seen = getArray();

      while (++argsIndex < argsLength) {
        var value = args[argsIndex];
        caches[argsIndex] = indexOf === baseIndexOf &&
          (value ? value.length : 0) >= largeArraySize &&
          createCache(argsIndex ? args[argsIndex] : seen);
      }
      outer:
      while (++index < length) {
        var cache = caches[0];
        value = array[index];

        if ((cache ? cacheIndexOf(cache, value) : indexOf(seen, value)) < 0) {
          argsIndex = argsLength;
          (cache || seen).push(value);
          while (--argsIndex) {
            cache = caches[argsIndex];
            if ((cache ? cacheIndexOf(cache, value) : indexOf(args[argsIndex], value)) < 0) {
              continue outer;
            }
          }
          result.push(value);
        }
      }
      while (argsLength--) {
        cache = caches[argsLength];
        if (cache) {
          releaseObject(cache);
        }
      }
      releaseArray(caches);
      releaseArray(seen);
      return result;
    }

    /**
     * Gets the last element or last `n` elements of an array. If a callback is
     * provided elements at the end of the array are returned as long as the
     * callback returns truey. The callback is bound to `thisArg` and invoked
     * with three arguments; (value, index, array).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to query.
     * @param {Function|Object|number|string} [callback] The function called
     *  per element or the number of elements to return. If a property name or
     *  object is provided it will be used to create a "_.pluck" or "_.where"
     *  style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {*} Returns the last element(s) of `array`.
     * @example
     *
     * _.last([1, 2, 3]);
     * // => 3
     *
     * _.last([1, 2, 3], 2);
     * // => [2, 3]
     *
     * _.last([1, 2, 3], function(num) {
     *   return num > 1;
     * });
     * // => [2, 3]
     *
     * var characters = [
     *   { 'name': 'barney',  'blocked': false, 'employer': 'slate' },
     *   { 'name': 'fred',    'blocked': true,  'employer': 'slate' },
     *   { 'name': 'pebbles', 'blocked': true,  'employer': 'na' }
     * ];
     *
     * // using "_.pluck" callback shorthand
     * _.pluck(_.last(characters, 'blocked'), 'name');
     * // => ['fred', 'pebbles']
     *
     * // using "_.where" callback shorthand
     * _.last(characters, { 'employer': 'na' });
     * // => [{ 'name': 'pebbles', 'blocked': true, 'employer': 'na' }]
     */
    function last(array, callback, thisArg) {
      var n = 0,
          length = array ? array.length : 0;

      if (typeof callback != 'number' && callback != null) {
        var index = length;
        callback = lodash.createCallback(callback, thisArg, 3);
        while (index-- && callback(array[index], index, array)) {
          n++;
        }
      } else {
        n = callback;
        if (n == null || thisArg) {
          return array ? array[length - 1] : undefined;
        }
      }
      return slice(array, nativeMax(0, length - n));
    }

    /**
     * Gets the index at which the last occurrence of `value` is found using strict
     * equality for comparisons, i.e. `===`. If `fromIndex` is negative, it is used
     * as the offset from the end of the collection.
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to search.
     * @param {*} value The value to search for.
     * @param {number} [fromIndex=array.length-1] The index to search from.
     * @returns {number} Returns the index of the matched value or `-1`.
     * @example
     *
     * _.lastIndexOf([1, 2, 3, 1, 2, 3], 2);
     * // => 4
     *
     * _.lastIndexOf([1, 2, 3, 1, 2, 3], 2, 3);
     * // => 1
     */
    function lastIndexOf(array, value, fromIndex) {
      var index = array ? array.length : 0;
      if (typeof fromIndex == 'number') {
        index = (fromIndex < 0 ? nativeMax(0, index + fromIndex) : nativeMin(fromIndex, index - 1)) + 1;
      }
      while (index--) {
        if (array[index] === value) {
          return index;
        }
      }
      return -1;
    }

    /**
     * Removes all provided values from the given array using strict equality for
     * comparisons, i.e. `===`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to modify.
     * @param {...*} [value] The values to remove.
     * @returns {Array} Returns `array`.
     * @example
     *
     * var array = [1, 2, 3, 1, 2, 3];
     * _.pull(array, 2, 3);
     * console.log(array);
     * // => [1, 1]
     */
    function pull(array) {
      var args = arguments,
          argsIndex = 0,
          argsLength = args.length,
          length = array ? array.length : 0;

      while (++argsIndex < argsLength) {
        var index = -1,
            value = args[argsIndex];
        while (++index < length) {
          if (array[index] === value) {
            splice.call(array, index--, 1);
            length--;
          }
        }
      }
      return array;
    }

    /**
     * Creates an array of numbers (positive and/or negative) progressing from
     * `start` up to but not including `end`. If `start` is less than `stop` a
     * zero-length range is created unless a negative `step` is specified.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {number} [start=0] The start of the range.
     * @param {number} end The end of the range.
     * @param {number} [step=1] The value to increment or decrement by.
     * @returns {Array} Returns a new range array.
     * @example
     *
     * _.range(4);
     * // => [0, 1, 2, 3]
     *
     * _.range(1, 5);
     * // => [1, 2, 3, 4]
     *
     * _.range(0, 20, 5);
     * // => [0, 5, 10, 15]
     *
     * _.range(0, -4, -1);
     * // => [0, -1, -2, -3]
     *
     * _.range(1, 4, 0);
     * // => [1, 1, 1]
     *
     * _.range(0);
     * // => []
     */
    function range(start, end, step) {
      start = +start || 0;
      step = typeof step == 'number' ? step : (+step || 1);

      if (end == null) {
        end = start;
        start = 0;
      }
      // use `Array(length)` so engines like Chakra and V8 avoid slower modes
      // http://youtu.be/XAqIpGU8ZZk#t=17m25s
      var index = -1,
          length = nativeMax(0, ceil((end - start) / (step || 1))),
          result = Array(length);

      while (++index < length) {
        result[index] = start;
        start += step;
      }
      return result;
    }

    /**
     * Removes all elements from an array that the callback returns truey for
     * and returns an array of removed elements. The callback is bound to `thisArg`
     * and invoked with three arguments; (value, index, array).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to modify.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array} Returns a new array of removed elements.
     * @example
     *
     * var array = [1, 2, 3, 4, 5, 6];
     * var evens = _.remove(array, function(num) { return num % 2 == 0; });
     *
     * console.log(array);
     * // => [1, 3, 5]
     *
     * console.log(evens);
     * // => [2, 4, 6]
     */
    function remove(array, callback, thisArg) {
      var index = -1,
          length = array ? array.length : 0,
          result = [];

      callback = lodash.createCallback(callback, thisArg, 3);
      while (++index < length) {
        var value = array[index];
        if (callback(value, index, array)) {
          result.push(value);
          splice.call(array, index--, 1);
          length--;
        }
      }
      return result;
    }

    /**
     * The opposite of `_.initial` this method gets all but the first element or
     * first `n` elements of an array. If a callback function is provided elements
     * at the beginning of the array are excluded from the result as long as the
     * callback returns truey. The callback is bound to `thisArg` and invoked
     * with three arguments; (value, index, array).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @alias drop, tail
     * @category Arrays
     * @param {Array} array The array to query.
     * @param {Function|Object|number|string} [callback=1] The function called
     *  per element or the number of elements to exclude. If a property name or
     *  object is provided it will be used to create a "_.pluck" or "_.where"
     *  style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array} Returns a slice of `array`.
     * @example
     *
     * _.rest([1, 2, 3]);
     * // => [2, 3]
     *
     * _.rest([1, 2, 3], 2);
     * // => [3]
     *
     * _.rest([1, 2, 3], function(num) {
     *   return num < 3;
     * });
     * // => [3]
     *
     * var characters = [
     *   { 'name': 'barney',  'blocked': true,  'employer': 'slate' },
     *   { 'name': 'fred',    'blocked': false,  'employer': 'slate' },
     *   { 'name': 'pebbles', 'blocked': true, 'employer': 'na' }
     * ];
     *
     * // using "_.pluck" callback shorthand
     * _.pluck(_.rest(characters, 'blocked'), 'name');
     * // => ['fred', 'pebbles']
     *
     * // using "_.where" callback shorthand
     * _.rest(characters, { 'employer': 'slate' });
     * // => [{ 'name': 'pebbles', 'blocked': true, 'employer': 'na' }]
     */
    function rest(array, callback, thisArg) {
      if (typeof callback != 'number' && callback != null) {
        var n = 0,
            index = -1,
            length = array ? array.length : 0;

        callback = lodash.createCallback(callback, thisArg, 3);
        while (++index < length && callback(array[index], index, array)) {
          n++;
        }
      } else {
        n = (callback == null || thisArg) ? 1 : nativeMax(0, callback);
      }
      return slice(array, n);
    }

    /**
     * Uses a binary search to determine the smallest index at which a value
     * should be inserted into a given sorted array in order to maintain the sort
     * order of the array. If a callback is provided it will be executed for
     * `value` and each element of `array` to compute their sort ranking. The
     * callback is bound to `thisArg` and invoked with one argument; (value).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to inspect.
     * @param {*} value The value to evaluate.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {number} Returns the index at which `value` should be inserted
     *  into `array`.
     * @example
     *
     * _.sortedIndex([20, 30, 50], 40);
     * // => 2
     *
     * // using "_.pluck" callback shorthand
     * _.sortedIndex([{ 'x': 20 }, { 'x': 30 }, { 'x': 50 }], { 'x': 40 }, 'x');
     * // => 2
     *
     * var dict = {
     *   'wordToNumber': { 'twenty': 20, 'thirty': 30, 'fourty': 40, 'fifty': 50 }
     * };
     *
     * _.sortedIndex(['twenty', 'thirty', 'fifty'], 'fourty', function(word) {
     *   return dict.wordToNumber[word];
     * });
     * // => 2
     *
     * _.sortedIndex(['twenty', 'thirty', 'fifty'], 'fourty', function(word) {
     *   return this.wordToNumber[word];
     * }, dict);
     * // => 2
     */
    function sortedIndex(array, value, callback, thisArg) {
      var low = 0,
          high = array ? array.length : low;

      // explicitly reference `identity` for better inlining in Firefox
      callback = callback ? lodash.createCallback(callback, thisArg, 1) : identity;
      value = callback(value);

      while (low < high) {
        var mid = (low + high) >>> 1;
        (callback(array[mid]) < value)
          ? low = mid + 1
          : high = mid;
      }
      return low;
    }

    /**
     * Creates an array of unique values, in order, of the provided arrays using
     * strict equality for comparisons, i.e. `===`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {...Array} [array] The arrays to inspect.
     * @returns {Array} Returns an array of composite values.
     * @example
     *
     * _.union([1, 2, 3], [101, 2, 1, 10], [2, 1]);
     * // => [1, 2, 3, 101, 10]
     */
    function union(array) {
      return baseUniq(baseFlatten(arguments, true, true));
    }

    /**
     * Creates a duplicate-value-free version of an array using strict equality
     * for comparisons, i.e. `===`. If the array is sorted, providing
     * `true` for `isSorted` will use a faster algorithm. If a callback is provided
     * each element of `array` is passed through the callback before uniqueness
     * is computed. The callback is bound to `thisArg` and invoked with three
     * arguments; (value, index, array).
     *
     * If a property name is provided for `callback` the created "_.pluck" style
     * callback will return the property value of the given element.
     *
     * If an object is provided for `callback` the created "_.where" style callback
     * will return `true` for elements that have the properties of the given object,
     * else `false`.
     *
     * @static
     * @memberOf _
     * @alias unique
     * @category Arrays
     * @param {Array} array The array to process.
     * @param {boolean} [isSorted=false] A flag to indicate that `array` is sorted.
     * @param {Function|Object|string} [callback=identity] The function called
     *  per iteration. If a property name or object is provided it will be used
     *  to create a "_.pluck" or "_.where" style callback, respectively.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array} Returns a duplicate-value-free array.
     * @example
     *
     * _.uniq([1, 2, 1, 3, 1]);
     * // => [1, 2, 3]
     *
     * _.uniq([1, 1, 2, 2, 3], true);
     * // => [1, 2, 3]
     *
     * _.uniq(['A', 'b', 'C', 'a', 'B', 'c'], function(letter) { return letter.toLowerCase(); });
     * // => ['A', 'b', 'C']
     *
     * _.uniq([1, 2.5, 3, 1.5, 2, 3.5], function(num) { return this.floor(num); }, Math);
     * // => [1, 2.5, 3]
     *
     * // using "_.pluck" callback shorthand
     * _.uniq([{ 'x': 1 }, { 'x': 2 }, { 'x': 1 }], 'x');
     * // => [{ 'x': 1 }, { 'x': 2 }]
     */
    function uniq(array, isSorted, callback, thisArg) {
      // juggle arguments
      if (typeof isSorted != 'boolean' && isSorted != null) {
        thisArg = callback;
        callback = (typeof isSorted != 'function' && thisArg && thisArg[isSorted] === array) ? null : isSorted;
        isSorted = false;
      }
      if (callback != null) {
        callback = lodash.createCallback(callback, thisArg, 3);
      }
      return baseUniq(array, isSorted, callback);
    }

    /**
     * Creates an array excluding all provided values using strict equality for
     * comparisons, i.e. `===`.
     *
     * @static
     * @memberOf _
     * @category Arrays
     * @param {Array} array The array to filter.
     * @param {...*} [value] The values to exclude.
     * @returns {Array} Returns a new array of filtered values.
     * @example
     *
     * _.without([1, 2, 1, 0, 3, 1, 4], 0, 1);
     * // => [2, 3, 4]
     */
    function without(array) {
      return baseDifference(array, slice(arguments, 1));
    }

    /**
     * Creates an array of grouped elements, the first of which contains the first
     * elements of the given arrays, the second of which contains the second
     * elements of the given arrays, and so on.
     *
     * @static
     * @memberOf _
     * @alias unzip
     * @category Arrays
     * @param {...Array} [array] Arrays to process.
     * @returns {Array} Returns a new array of grouped elements.
     * @example
     *
     * _.zip(['fred', 'barney'], [30, 40], [true, false]);
     * // => [['fred', 30, true], ['barney', 40, false]]
     */
    function zip() {
      var array = arguments.length > 1 ? arguments : arguments[0],
          index = -1,
          length = array ? max(pluck(array, 'length')) : 0,
          result = Array(length < 0 ? 0 : length);

      while (++index < length) {
        result[index] = pluck(array, index);
      }
      return result;
    }

    /**
     * Creates an object composed from arrays of `keys` and `values`. Provide
     * either a single two dimensional array, i.e. `[[key1, value1], [key2, value2]]`
     * or two arrays, one of `keys` and one of corresponding `values`.
     *
     * @static
     * @memberOf _
     * @alias object
     * @category Arrays
     * @param {Array} keys The array of keys.
     * @param {Array} [values=[]] The array of values.
     * @returns {Object} Returns an object composed of the given keys and
     *  corresponding values.
     * @example
     *
     * _.zipObject(['fred', 'barney'], [30, 40]);
     * // => { 'fred': 30, 'barney': 40 }
     */
    function zipObject(keys, values) {
      var index = -1,
          length = keys ? keys.length : 0,
          result = {};

      while (++index < length) {
        var key = keys[index];
        if (values) {
          result[key] = values[index];
        } else if (key) {
          result[key[0]] = key[1];
        }
      }
      return result;
    }

    /*--------------------------------------------------------------------------*/

    /**
     * Creates a function that executes `func`, with  the `this` binding and
     * arguments of the created function, only after being called `n` times.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {number} n The number of times the function must be called before
     *  `func` is executed.
     * @param {Function} func The function to restrict.
     * @returns {Function} Returns the new restricted function.
     * @example
     *
     * var saves = ['profile', 'settings'];
     *
     * var done = _.after(saves.length, function() {
     *   console.log('Done saving!');
     * });
     *
     * _.forEach(saves, function(type) {
     *   asyncSave({ 'type': type, 'complete': done });
     * });
     * // => logs 'Done saving!', after all saves have completed
     */
    function after(n, func) {
      if (!isFunction(func)) {
        throw new TypeError;
      }
      return function() {
        if (--n < 1) {
          return func.apply(this, arguments);
        }
      };
    }

    /**
     * Creates a function that, when called, invokes `func` with the `this`
     * binding of `thisArg` and prepends any additional `bind` arguments to those
     * provided to the bound function.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Function} func The function to bind.
     * @param {*} [thisArg] The `this` binding of `func`.
     * @param {...*} [arg] Arguments to be partially applied.
     * @returns {Function} Returns the new bound function.
     * @example
     *
     * var func = function(greeting) {
     *   return greeting + ' ' + this.name;
     * };
     *
     * func = _.bind(func, { 'name': 'fred' }, 'hi');
     * func();
     * // => 'hi fred'
     */
    function bind(func, thisArg) {
      return arguments.length > 2
        ? createWrapper(func, 17, slice(arguments, 2), null, thisArg)
        : createWrapper(func, 1, null, null, thisArg);
    }

    /**
     * Binds methods of an object to the object itself, overwriting the existing
     * method. Method names may be specified as individual arguments or as arrays
     * of method names. If no method names are provided all the function properties
     * of `object` will be bound.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Object} object The object to bind and assign the bound methods to.
     * @param {...string} [methodName] The object method names to
     *  bind, specified as individual method names or arrays of method names.
     * @returns {Object} Returns `object`.
     * @example
     *
     * var view = {
     *  'label': 'docs',
     *  'onClick': function() { console.log('clicked ' + this.label); }
     * };
     *
     * _.bindAll(view);
     * jQuery('#docs').on('click', view.onClick);
     * // => logs 'clicked docs', when the button is clicked
     */
    function bindAll(object) {
      var funcs = arguments.length > 1 ? baseFlatten(arguments, true, false, 1) : functions(object),
          index = -1,
          length = funcs.length;

      while (++index < length) {
        var key = funcs[index];
        object[key] = createWrapper(object[key], 1, null, null, object);
      }
      return object;
    }

    /**
     * Creates a function that, when called, invokes the method at `object[key]`
     * and prepends any additional `bindKey` arguments to those provided to the bound
     * function. This method differs from `_.bind` by allowing bound functions to
     * reference methods that will be redefined or don't yet exist.
     * See http://michaux.ca/articles/lazy-function-definition-pattern.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Object} object The object the method belongs to.
     * @param {string} key The key of the method.
     * @param {...*} [arg] Arguments to be partially applied.
     * @returns {Function} Returns the new bound function.
     * @example
     *
     * var object = {
     *   'name': 'fred',
     *   'greet': function(greeting) {
     *     return greeting + ' ' + this.name;
     *   }
     * };
     *
     * var func = _.bindKey(object, 'greet', 'hi');
     * func();
     * // => 'hi fred'
     *
     * object.greet = function(greeting) {
     *   return greeting + 'ya ' + this.name + '!';
     * };
     *
     * func();
     * // => 'hiya fred!'
     */
    function bindKey(object, key) {
      return arguments.length > 2
        ? createWrapper(key, 19, slice(arguments, 2), null, object)
        : createWrapper(key, 3, null, null, object);
    }

    /**
     * Creates a function that is the composition of the provided functions,
     * where each function consumes the return value of the function that follows.
     * For example, composing the functions `f()`, `g()`, and `h()` produces `f(g(h()))`.
     * Each function is executed with the `this` binding of the composed function.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {...Function} [func] Functions to compose.
     * @returns {Function} Returns the new composed function.
     * @example
     *
     * var realNameMap = {
     *   'pebbles': 'penelope'
     * };
     *
     * var format = function(name) {
     *   name = realNameMap[name.toLowerCase()] || name;
     *   return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
     * };
     *
     * var greet = function(formatted) {
     *   return 'Hiya ' + formatted + '!';
     * };
     *
     * var welcome = _.compose(greet, format);
     * welcome('pebbles');
     * // => 'Hiya Penelope!'
     */
    function compose() {
      var funcs = arguments,
          length = funcs.length;

      while (length--) {
        if (!isFunction(funcs[length])) {
          throw new TypeError;
        }
      }
      return function() {
        var args = arguments,
            length = funcs.length;

        while (length--) {
          args = [funcs[length].apply(this, args)];
        }
        return args[0];
      };
    }

    /**
     * Produces a callback bound to an optional `thisArg`. If `func` is a property
     * name the created callback will return the property value for a given element.
     * If `func` is an object the created callback will return `true` for elements
     * that contain the equivalent object properties, otherwise it will return `false`.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {*} [func=identity] The value to convert to a callback.
     * @param {*} [thisArg] The `this` binding of the created callback.
     * @param {number} [argCount] The number of arguments the callback accepts.
     * @returns {Function} Returns a callback function.
     * @example
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36 },
     *   { 'name': 'fred',   'age': 40 }
     * ];
     *
     * // wrap to create custom callback shorthands
     * _.createCallback = _.wrap(_.createCallback, function(func, callback, thisArg) {
     *   var match = /^(.+?)__([gl]t)(.+)$/.exec(callback);
     *   return !match ? func(callback, thisArg) : function(object) {
     *     return match[2] == 'gt' ? object[match[1]] > match[3] : object[match[1]] < match[3];
     *   };
     * });
     *
     * _.filter(characters, 'age__gt38');
     * // => [{ 'name': 'fred', 'age': 40 }]
     */
    function createCallback(func, thisArg, argCount) {
      var type = typeof func;
      if (func == null || type == 'function') {
        return baseCreateCallback(func, thisArg, argCount);
      }
      // handle "_.pluck" style callback shorthands
      if (type != 'object') {
        return function(object) {
          return object[func];
        };
      }
      var props = keys(func),
          key = props[0],
          a = func[key];

      // handle "_.where" style callback shorthands
      if (props.length == 1 && a === a && !isObject(a)) {
        // fast path the common case of providing an object with a single
        // property containing a primitive value
        return function(object) {
          var b = object[key];
          return a === b && (a !== 0 || (1 / a == 1 / b));
        };
      }
      return function(object) {
        var length = props.length,
            result = false;

        while (length--) {
          if (!(result = baseIsEqual(object[props[length]], func[props[length]], null, true))) {
            break;
          }
        }
        return result;
      };
    }

    /**
     * Creates a function which accepts one or more arguments of `func` that when
     * invoked either executes `func` returning its result, if all `func` arguments
     * have been provided, or returns a function that accepts one or more of the
     * remaining `func` arguments, and so on. The arity of `func` can be specified
     * if `func.length` is not sufficient.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Function} func The function to curry.
     * @param {number} [arity=func.length] The arity of `func`.
     * @returns {Function} Returns the new curried function.
     * @example
     *
     * var curried = _.curry(function(a, b, c) {
     *   console.log(a + b + c);
     * });
     *
     * curried(1)(2)(3);
     * // => 6
     *
     * curried(1, 2)(3);
     * // => 6
     *
     * curried(1, 2, 3);
     * // => 6
     */
    function curry(func, arity) {
      arity = typeof arity == 'number' ? arity : (+arity || func.length);
      return createWrapper(func, 4, null, null, null, arity);
    }

    /**
     * Creates a function that will delay the execution of `func` until after
     * `wait` milliseconds have elapsed since the last time it was invoked.
     * Provide an options object to indicate that `func` should be invoked on
     * the leading and/or trailing edge of the `wait` timeout. Subsequent calls
     * to the debounced function will return the result of the last `func` call.
     *
     * Note: If `leading` and `trailing` options are `true` `func` will be called
     * on the trailing edge of the timeout only if the the debounced function is
     * invoked more than once during the `wait` timeout.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Function} func The function to debounce.
     * @param {number} wait The number of milliseconds to delay.
     * @param {Object} [options] The options object.
     * @param {boolean} [options.leading=false] Specify execution on the leading edge of the timeout.
     * @param {number} [options.maxWait] The maximum time `func` is allowed to be delayed before it's called.
     * @param {boolean} [options.trailing=true] Specify execution on the trailing edge of the timeout.
     * @returns {Function} Returns the new debounced function.
     * @example
     *
     * // avoid costly calculations while the window size is in flux
     * var lazyLayout = _.debounce(calculateLayout, 150);
     * jQuery(window).on('resize', lazyLayout);
     *
     * // execute `sendMail` when the click event is fired, debouncing subsequent calls
     * jQuery('#postbox').on('click', _.debounce(sendMail, 300, {
     *   'leading': true,
     *   'trailing': false
     * });
     *
     * // ensure `batchLog` is executed once after 1 second of debounced calls
     * var source = new EventSource('/stream');
     * source.addEventListener('message', _.debounce(batchLog, 250, {
     *   'maxWait': 1000
     * }, false);
     */
    function debounce(func, wait, options) {
      var args,
          maxTimeoutId,
          result,
          stamp,
          thisArg,
          timeoutId,
          trailingCall,
          lastCalled = 0,
          maxWait = false,
          trailing = true;

      if (!isFunction(func)) {
        throw new TypeError;
      }
      wait = nativeMax(0, wait) || 0;
      if (options === true) {
        var leading = true;
        trailing = false;
      } else if (isObject(options)) {
        leading = options.leading;
        maxWait = 'maxWait' in options && (nativeMax(wait, options.maxWait) || 0);
        trailing = 'trailing' in options ? options.trailing : trailing;
      }
      var delayed = function() {
        var remaining = wait - (now() - stamp);
        if (remaining <= 0) {
          if (maxTimeoutId) {
            clearTimeout(maxTimeoutId);
          }
          var isCalled = trailingCall;
          maxTimeoutId = timeoutId = trailingCall = undefined;
          if (isCalled) {
            lastCalled = now();
            result = func.apply(thisArg, args);
            if (!timeoutId && !maxTimeoutId) {
              args = thisArg = null;
            }
          }
        } else {
          timeoutId = setTimeout(delayed, remaining);
        }
      };

      var maxDelayed = function() {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        maxTimeoutId = timeoutId = trailingCall = undefined;
        if (trailing || (maxWait !== wait)) {
          lastCalled = now();
          result = func.apply(thisArg, args);
          if (!timeoutId && !maxTimeoutId) {
            args = thisArg = null;
          }
        }
      };

      return function() {
        args = arguments;
        stamp = now();
        thisArg = this;
        trailingCall = trailing && (timeoutId || !leading);

        if (maxWait === false) {
          var leadingCall = leading && !timeoutId;
        } else {
          if (!maxTimeoutId && !leading) {
            lastCalled = stamp;
          }
          var remaining = maxWait - (stamp - lastCalled),
              isCalled = remaining <= 0;

          if (isCalled) {
            if (maxTimeoutId) {
              maxTimeoutId = clearTimeout(maxTimeoutId);
            }
            lastCalled = stamp;
            result = func.apply(thisArg, args);
          }
          else if (!maxTimeoutId) {
            maxTimeoutId = setTimeout(maxDelayed, remaining);
          }
        }
        if (isCalled && timeoutId) {
          timeoutId = clearTimeout(timeoutId);
        }
        else if (!timeoutId && wait !== maxWait) {
          timeoutId = setTimeout(delayed, wait);
        }
        if (leadingCall) {
          isCalled = true;
          result = func.apply(thisArg, args);
        }
        if (isCalled && !timeoutId && !maxTimeoutId) {
          args = thisArg = null;
        }
        return result;
      };
    }

    /**
     * Defers executing the `func` function until the current call stack has cleared.
     * Additional arguments will be provided to `func` when it is invoked.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Function} func The function to defer.
     * @param {...*} [arg] Arguments to invoke the function with.
     * @returns {number} Returns the timer id.
     * @example
     *
     * _.defer(function() { console.log('deferred'); });
     * // returns from the function before 'deferred' is logged
     */
    function defer(func) {
      if (!isFunction(func)) {
        throw new TypeError;
      }
      var args = slice(arguments, 1);
      return setTimeout(function() { func.apply(undefined, args); }, 1);
    }
    // use `setImmediate` if available in Node.js
    if (setImmediate) {
      defer = function(func) {
        if (!isFunction(func)) {
          throw new TypeError;
        }
        return setImmediate.apply(context, arguments);
      };
    }

    /**
     * Executes the `func` function after `wait` milliseconds. Additional arguments
     * will be provided to `func` when it is invoked.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Function} func The function to delay.
     * @param {number} wait The number of milliseconds to delay execution.
     * @param {...*} [arg] Arguments to invoke the function with.
     * @returns {number} Returns the timer id.
     * @example
     *
     * var log = _.bind(console.log, console);
     * _.delay(log, 1000, 'logged later');
     * // => 'logged later' (Appears after one second.)
     */
    function delay(func, wait) {
      if (!isFunction(func)) {
        throw new TypeError;
      }
      var args = slice(arguments, 2);
      return setTimeout(function() { func.apply(undefined, args); }, wait);
    }

    /**
     * Creates a function that memoizes the result of `func`. If `resolver` is
     * provided it will be used to determine the cache key for storing the result
     * based on the arguments provided to the memoized function. By default, the
     * first argument provided to the memoized function is used as the cache key.
     * The `func` is executed with the `this` binding of the memoized function.
     * The result cache is exposed as the `cache` property on the memoized function.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Function} func The function to have its output memoized.
     * @param {Function} [resolver] A function used to resolve the cache key.
     * @returns {Function} Returns the new memoizing function.
     * @example
     *
     * var fibonacci = _.memoize(function(n) {
     *   return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2);
     * });
     *
     * fibonacci(9)
     * // => 34
     *
     * var data = {
     *   'fred': { 'name': 'fred', 'age': 40 },
     *   'pebbles': { 'name': 'pebbles', 'age': 1 }
     * };
     *
     * // modifying the result cache
     * var get = _.memoize(function(name) { return data[name]; }, _.identity);
     * get('pebbles');
     * // => { 'name': 'pebbles', 'age': 1 }
     *
     * get.cache.pebbles.name = 'penelope';
     * get('pebbles');
     * // => { 'name': 'penelope', 'age': 1 }
     */
    function memoize(func, resolver) {
      if (!isFunction(func)) {
        throw new TypeError;
      }
      var memoized = function() {
        var cache = memoized.cache,
            key = resolver ? resolver.apply(this, arguments) : keyPrefix + arguments[0];

        return hasOwnProperty.call(cache, key)
          ? cache[key]
          : (cache[key] = func.apply(this, arguments));
      }
      memoized.cache = {};
      return memoized;
    }

    /**
     * Creates a function that is restricted to execute `func` once. Repeat calls to
     * the function will return the value of the first call. The `func` is executed
     * with the `this` binding of the created function.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Function} func The function to restrict.
     * @returns {Function} Returns the new restricted function.
     * @example
     *
     * var initialize = _.once(createApplication);
     * initialize();
     * initialize();
     * // `initialize` executes `createApplication` once
     */
    function once(func) {
      var ran,
          result;

      if (!isFunction(func)) {
        throw new TypeError;
      }
      return function() {
        if (ran) {
          return result;
        }
        ran = true;
        result = func.apply(this, arguments);

        // clear the `func` variable so the function may be garbage collected
        func = null;
        return result;
      };
    }

    /**
     * Creates a function that, when called, invokes `func` with any additional
     * `partial` arguments prepended to those provided to the new function. This
     * method is similar to `_.bind` except it does **not** alter the `this` binding.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Function} func The function to partially apply arguments to.
     * @param {...*} [arg] Arguments to be partially applied.
     * @returns {Function} Returns the new partially applied function.
     * @example
     *
     * var greet = function(greeting, name) { return greeting + ' ' + name; };
     * var hi = _.partial(greet, 'hi');
     * hi('fred');
     * // => 'hi fred'
     */
    function partial(func) {
      return createWrapper(func, 16, slice(arguments, 1));
    }

    /**
     * This method is like `_.partial` except that `partial` arguments are
     * appended to those provided to the new function.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Function} func The function to partially apply arguments to.
     * @param {...*} [arg] Arguments to be partially applied.
     * @returns {Function} Returns the new partially applied function.
     * @example
     *
     * var defaultsDeep = _.partialRight(_.merge, _.defaults);
     *
     * var options = {
     *   'variable': 'data',
     *   'imports': { 'jq': $ }
     * };
     *
     * defaultsDeep(options, _.templateSettings);
     *
     * options.variable
     * // => 'data'
     *
     * options.imports
     * // => { '_': _, 'jq': $ }
     */
    function partialRight(func) {
      return createWrapper(func, 32, null, slice(arguments, 1));
    }

    /**
     * Creates a function that, when executed, will only call the `func` function
     * at most once per every `wait` milliseconds. Provide an options object to
     * indicate that `func` should be invoked on the leading and/or trailing edge
     * of the `wait` timeout. Subsequent calls to the throttled function will
     * return the result of the last `func` call.
     *
     * Note: If `leading` and `trailing` options are `true` `func` will be called
     * on the trailing edge of the timeout only if the the throttled function is
     * invoked more than once during the `wait` timeout.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {Function} func The function to throttle.
     * @param {number} wait The number of milliseconds to throttle executions to.
     * @param {Object} [options] The options object.
     * @param {boolean} [options.leading=true] Specify execution on the leading edge of the timeout.
     * @param {boolean} [options.trailing=true] Specify execution on the trailing edge of the timeout.
     * @returns {Function} Returns the new throttled function.
     * @example
     *
     * // avoid excessively updating the position while scrolling
     * var throttled = _.throttle(updatePosition, 100);
     * jQuery(window).on('scroll', throttled);
     *
     * // execute `renewToken` when the click event is fired, but not more than once every 5 minutes
     * jQuery('.interactive').on('click', _.throttle(renewToken, 300000, {
     *   'trailing': false
     * }));
     */
    function throttle(func, wait, options) {
      var leading = true,
          trailing = true;

      if (!isFunction(func)) {
        throw new TypeError;
      }
      if (options === false) {
        leading = false;
      } else if (isObject(options)) {
        leading = 'leading' in options ? options.leading : leading;
        trailing = 'trailing' in options ? options.trailing : trailing;
      }
      debounceOptions.leading = leading;
      debounceOptions.maxWait = wait;
      debounceOptions.trailing = trailing;

      return debounce(func, wait, debounceOptions);
    }

    /**
     * Creates a function that provides `value` to the wrapper function as its
     * first argument. Additional arguments provided to the function are appended
     * to those provided to the wrapper function. The wrapper is executed with
     * the `this` binding of the created function.
     *
     * @static
     * @memberOf _
     * @category Functions
     * @param {*} value The value to wrap.
     * @param {Function} wrapper The wrapper function.
     * @returns {Function} Returns the new function.
     * @example
     *
     * var p = _.wrap(_.escape, function(func, text) {
     *   return '<p>' + func(text) + '</p>';
     * });
     *
     * p('Fred, Wilma, & Pebbles');
     * // => '<p>Fred, Wilma, &amp; Pebbles</p>'
     */
    function wrap(value, wrapper) {
      return createWrapper(wrapper, 16, [value]);
    }

    /*--------------------------------------------------------------------------*/

    /**
     * Converts the characters `&`, `<`, `>`, `"`, and `'` in `string` to their
     * corresponding HTML entities.
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @param {string} string The string to escape.
     * @returns {string} Returns the escaped string.
     * @example
     *
     * _.escape('Fred, Wilma, & Pebbles');
     * // => 'Fred, Wilma, &amp; Pebbles'
     */
    function escape(string) {
      return string == null ? '' : String(string).replace(reUnescapedHtml, escapeHtmlChar);
    }

    /**
     * This method returns the first argument provided to it.
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @param {*} value Any value.
     * @returns {*} Returns `value`.
     * @example
     *
     * var object = { 'name': 'fred' };
     * _.identity(object) === object;
     * // => true
     */
    function identity(value) {
      return value;
    }

    /**
     * Adds function properties of a source object to the `lodash` function and
     * chainable wrapper.
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @param {Object} object The object of function properties to add to `lodash`.
     * @param {Object} object The object of function properties to add to `lodash`.
     * @example
     *
     * _.mixin({
     *   'capitalize': function(string) {
     *     return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
     *   }
     * });
     *
     * _.capitalize('fred');
     * // => 'Fred'
     *
     * _('fred').capitalize();
     * // => 'Fred'
     */
    function mixin(object, source) {
      var ctor = object,
          isFunc = !source || isFunction(ctor);

      if (!source) {
        ctor = lodashWrapper;
        source = object;
        object = lodash;
      }
      forEach(functions(source), function(methodName) {
        var func = object[methodName] = source[methodName];
        if (isFunc) {
          ctor.prototype[methodName] = function() {
            var value = this.__wrapped__,
                args = [value];

            push.apply(args, arguments);
            var result = func.apply(object, args);
            if (value && typeof value == 'object' && value === result) {
              return this;
            }
            result = new ctor(result);
            result.__chain__ = this.__chain__;
            return result;
          };
        }
      });
    }

    /**
     * Reverts the '_' variable to its previous value and returns a reference to
     * the `lodash` function.
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @returns {Function} Returns the `lodash` function.
     * @example
     *
     * var lodash = _.noConflict();
     */
    function noConflict() {
      context._ = oldDash;
      return this;
    }

    /**
     * A no-operation function.
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @example
     *
     * var object = { 'name': 'fred' };
     * _.noop(object) === undefined;
     * // => true
     */
    function noop() {
      // no operation performed
    }

    /**
     * Converts the given value into an integer of the specified radix.
     * If `radix` is `undefined` or `0` a `radix` of `10` is used unless the
     * `value` is a hexadecimal, in which case a `radix` of `16` is used.
     *
     * Note: This method avoids differences in native ES3 and ES5 `parseInt`
     * implementations. See http://es5.github.io/#E.
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @param {string} value The value to parse.
     * @param {number} [radix] The radix used to interpret the value to parse.
     * @returns {number} Returns the new integer value.
     * @example
     *
     * _.parseInt('08');
     * // => 8
     */
    var parseInt = nativeParseInt(whitespace + '08') == 8 ? nativeParseInt : function(value, radix) {
      // Firefox < 21 and Opera < 15 follow the ES3 specified implementation of `parseInt`
      return nativeParseInt(isString(value) ? value.replace(reLeadingSpacesAndZeros, '') : value, radix || 0);
    };

    /**
     * Produces a random number between `min` and `max` (inclusive). If only one
     * argument is provided a number between `0` and the given number will be
     * returned. If `floating` is truey or either `min` or `max` are floats a
     * floating-point number will be returned instead of an integer.
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @param {number} [min=0] The minimum possible value.
     * @param {number} [max=1] The maximum possible value.
     * @param {boolean} [floating=false] Specify returning a floating-point number.
     * @returns {number} Returns a random number.
     * @example
     *
     * _.random(0, 5);
     * // => an integer between 0 and 5
     *
     * _.random(5);
     * // => also an integer between 0 and 5
     *
     * _.random(5, true);
     * // => a floating-point number between 0 and 5
     *
     * _.random(1.2, 5.2);
     * // => a floating-point number between 1.2 and 5.2
     */
    function random(min, max, floating) {
      var noMin = min == null,
          noMax = max == null;

      if (floating == null) {
        if (typeof min == 'boolean' && noMax) {
          floating = min;
          min = 1;
        }
        else if (!noMax && typeof max == 'boolean') {
          floating = max;
          noMax = true;
        }
      }
      if (noMin && noMax) {
        max = 1;
      }
      min = +min || 0;
      if (noMax) {
        max = min;
        min = 0;
      } else {
        max = +max || 0;
      }
      if (floating || min % 1 || max % 1) {
        var rand = nativeRandom();
        return nativeMin(min + (rand * (max - min + parseFloat('1e-' + ((rand +'').length - 1)))), max);
      }
      return baseRandom(min, max);
    }

    /**
     * Resolves the value of `property` on `object`. If `property` is a function
     * it will be invoked with the `this` binding of `object` and its result returned,
     * else the property value is returned. If `object` is falsey then `undefined`
     * is returned.
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @param {Object} object The object to inspect.
     * @param {string} property The property to get the value of.
     * @returns {*} Returns the resolved value.
     * @example
     *
     * var object = {
     *   'cheese': 'crumpets',
     *   'stuff': function() {
     *     return 'nonsense';
     *   }
     * };
     *
     * _.result(object, 'cheese');
     * // => 'crumpets'
     *
     * _.result(object, 'stuff');
     * // => 'nonsense'
     */
    function result(object, property) {
      if (object) {
        var value = object[property];
        return isFunction(value) ? object[property]() : value;
      }
    }

    /**
     * A micro-templating method that handles arbitrary delimiters, preserves
     * whitespace, and correctly escapes quotes within interpolated code.
     *
     * Note: In the development build, `_.template` utilizes sourceURLs for easier
     * debugging. See http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/#toc-sourceurl
     *
     * For more information on precompiling templates see:
     * http://lodash.com/custom-builds
     *
     * For more information on Chrome extension sandboxes see:
     * http://developer.chrome.com/stable/extensions/sandboxingEval.html
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @param {string} text The template text.
     * @param {Object} data The data object used to populate the text.
     * @param {Object} [options] The options object.
     * @param {RegExp} [options.escape] The "escape" delimiter.
     * @param {RegExp} [options.evaluate] The "evaluate" delimiter.
     * @param {Object} [options.imports] An object to import into the template as local variables.
     * @param {RegExp} [options.interpolate] The "interpolate" delimiter.
     * @param {string} [sourceURL] The sourceURL of the template's compiled source.
     * @param {string} [variable] The data object variable name.
     * @returns {Function|string} Returns a compiled function when no `data` object
     *  is given, else it returns the interpolated text.
     * @example
     *
     * // using the "interpolate" delimiter to create a compiled template
     * var compiled = _.template('hello <%= name %>');
     * compiled({ 'name': 'fred' });
     * // => 'hello fred'
     *
     * // using the "escape" delimiter to escape HTML in data property values
     * _.template('<b><%- value %></b>', { 'value': '<script>' });
     * // => '<b>&lt;script&gt;</b>'
     *
     * // using the "evaluate" delimiter to generate HTML
     * var list = '<% _.forEach(people, function(name) { %><li><%- name %></li><% }); %>';
     * _.template(list, { 'people': ['fred', 'barney'] });
     * // => '<li>fred</li><li>barney</li>'
     *
     * // using the ES6 delimiter as an alternative to the default "interpolate" delimiter
     * _.template('hello ${ name }', { 'name': 'pebbles' });
     * // => 'hello pebbles'
     *
     * // using the internal `print` function in "evaluate" delimiters
     * _.template('<% print("hello " + name); %>!', { 'name': 'barney' });
     * // => 'hello barney!'
     *
     * // using a custom template delimiters
     * _.templateSettings = {
     *   'interpolate': /{{([\s\S]+?)}}/g
     * };
     *
     * _.template('hello {{ name }}!', { 'name': 'mustache' });
     * // => 'hello mustache!'
     *
     * // using the `imports` option to import jQuery
     * var list = '<% $.each(people, function(name) { %><li><%- name %></li><% }); %>';
     * _.template(list, { 'people': ['fred', 'barney'] }, { 'imports': { '$': jQuery } });
     * // => '<li>fred</li><li>barney</li>'
     *
     * // using the `sourceURL` option to specify a custom sourceURL for the template
     * var compiled = _.template('hello <%= name %>', null, { 'sourceURL': '/basic/greeting.jst' });
     * compiled(data);
     * // => find the source of "greeting.jst" under the Sources tab or Resources panel of the web inspector
     *
     * // using the `variable` option to ensure a with-statement isn't used in the compiled template
     * var compiled = _.template('hi <%= data.name %>!', null, { 'variable': 'data' });
     * compiled.source;
     * // => function(data) {
     *   var __t, __p = '', __e = _.escape;
     *   __p += 'hi ' + ((__t = ( data.name )) == null ? '' : __t) + '!';
     *   return __p;
     * }
     *
     * // using the `source` property to inline compiled templates for meaningful
     * // line numbers in error messages and a stack trace
     * fs.writeFileSync(path.join(cwd, 'jst.js'), '\
     *   var JST = {\
     *     "main": ' + _.template(mainText).source + '\
     *   };\
     * ');
     */
    function template(text, data, options) {
      // based on John Resig's `tmpl` implementation
      // http://ejohn.org/blog/javascript-micro-templating/
      // and Laura Doktorova's doT.js
      // https://github.com/olado/doT
      var settings = lodash.templateSettings;
      text = String(text || '');

      // avoid missing dependencies when `iteratorTemplate` is not defined
      options = iteratorTemplate ? defaults({}, options, settings) : settings;

      var imports = iteratorTemplate && defaults({}, options.imports, settings.imports),
          importsKeys = iteratorTemplate ? keys(imports) : ['_'],
          importsValues = iteratorTemplate ? values(imports) : [lodash];

      var isEvaluating,
          index = 0,
          interpolate = options.interpolate || reNoMatch,
          source = "__p += '";

      // compile the regexp to match each delimiter
      var reDelimiters = RegExp(
        (options.escape || reNoMatch).source + '|' +
        interpolate.source + '|' +
        (interpolate === reInterpolate ? reEsTemplate : reNoMatch).source + '|' +
        (options.evaluate || reNoMatch).source + '|$'
      , 'g');

      text.replace(reDelimiters, function(match, escapeValue, interpolateValue, esTemplateValue, evaluateValue, offset) {
        interpolateValue || (interpolateValue = esTemplateValue);

        // escape characters that cannot be included in string literals
        source += text.slice(index, offset).replace(reUnescapedString, escapeStringChar);

        // replace delimiters with snippets
        if (escapeValue) {
          source += "' +\n__e(" + escapeValue + ") +\n'";
        }
        if (evaluateValue) {
          isEvaluating = true;
          source += "';\n" + evaluateValue + ";\n__p += '";
        }
        if (interpolateValue) {
          source += "' +\n((__t = (" + interpolateValue + ")) == null ? '' : __t) +\n'";
        }
        index = offset + match.length;

        // the JS engine embedded in Adobe products requires returning the `match`
        // string in order to produce the correct `offset` value
        return match;
      });

      source += "';\n";

      // if `variable` is not specified, wrap a with-statement around the generated
      // code to add the data object to the top of the scope chain
      var variable = options.variable,
          hasVariable = variable;

      if (!hasVariable) {
        variable = 'obj';
        source = 'with (' + variable + ') {\n' + source + '\n}\n';
      }
      // cleanup code by stripping empty strings
      source = (isEvaluating ? source.replace(reEmptyStringLeading, '') : source)
        .replace(reEmptyStringMiddle, '$1')
        .replace(reEmptyStringTrailing, '$1;');

      // frame code as the function body
      source = 'function(' + variable + ') {\n' +
        (hasVariable ? '' : variable + ' || (' + variable + ' = {});\n') +
        "var __t, __p = '', __e = _.escape" +
        (isEvaluating
          ? ', __j = Array.prototype.join;\n' +
            "function print() { __p += __j.call(arguments, '') }\n"
          : ';\n'
        ) +
        source +
        'return __p\n}';

      // Use a sourceURL for easier debugging.
      // http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/#toc-sourceurl
      var sourceURL = '\n/*\n//# sourceURL=' + (options.sourceURL || '/lodash/template/source[' + (templateCounter++) + ']') + '\n*/';

      try {
        var result = Function(importsKeys, 'return ' + source + sourceURL).apply(undefined, importsValues);
      } catch(e) {
        e.source = source;
        throw e;
      }
      if (data) {
        return result(data);
      }
      // provide the compiled function's source by its `toString` method, in
      // supported environments, or the `source` property as a convenience for
      // inlining compiled templates during the build process
      result.source = source;
      return result;
    }

    /**
     * Executes the callback `n` times, returning an array of the results
     * of each callback execution. The callback is bound to `thisArg` and invoked
     * with one argument; (index).
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @param {number} n The number of times to execute the callback.
     * @param {Function} callback The function called per iteration.
     * @param {*} [thisArg] The `this` binding of `callback`.
     * @returns {Array} Returns an array of the results of each `callback` execution.
     * @example
     *
     * var diceRolls = _.times(3, _.partial(_.random, 1, 6));
     * // => [3, 6, 4]
     *
     * _.times(3, function(n) { mage.castSpell(n); });
     * // => calls `mage.castSpell(n)` three times, passing `n` of `0`, `1`, and `2` respectively
     *
     * _.times(3, function(n) { this.cast(n); }, mage);
     * // => also calls `mage.castSpell(n)` three times
     */
    function times(n, callback, thisArg) {
      n = (n = +n) > -1 ? n : 0;
      var index = -1,
          result = Array(n);

      callback = baseCreateCallback(callback, thisArg, 1);
      while (++index < n) {
        result[index] = callback(index);
      }
      return result;
    }

    /**
     * The inverse of `_.escape` this method converts the HTML entities
     * `&amp;`, `&lt;`, `&gt;`, `&quot;`, and `&#39;` in `string` to their
     * corresponding characters.
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @param {string} string The string to unescape.
     * @returns {string} Returns the unescaped string.
     * @example
     *
     * _.unescape('Fred, Barney &amp; Pebbles');
     * // => 'Fred, Barney & Pebbles'
     */
    function unescape(string) {
      return string == null ? '' : String(string).replace(reEscapedHtml, unescapeHtmlChar);
    }

    /**
     * Generates a unique ID. If `prefix` is provided the ID will be appended to it.
     *
     * @static
     * @memberOf _
     * @category Utilities
     * @param {string} [prefix] The value to prefix the ID with.
     * @returns {string} Returns the unique ID.
     * @example
     *
     * _.uniqueId('contact_');
     * // => 'contact_104'
     *
     * _.uniqueId();
     * // => '105'
     */
    function uniqueId(prefix) {
      var id = ++idCounter;
      return String(prefix == null ? '' : prefix) + id;
    }

    /*--------------------------------------------------------------------------*/

    /**
     * Creates a `lodash` object that wraps the given value with explicit
     * method chaining enabled.
     *
     * @static
     * @memberOf _
     * @category Chaining
     * @param {*} value The value to wrap.
     * @returns {Object} Returns the wrapper object.
     * @example
     *
     * var characters = [
     *   { 'name': 'barney',  'age': 36 },
     *   { 'name': 'fred',    'age': 40 },
     *   { 'name': 'pebbles', 'age': 1 }
     * ];
     *
     * var youngest = _.chain(characters)
     *     .sortBy('age')
     *     .map(function(chr) { return chr.name + ' is ' + chr.age; })
     *     .first()
     *     .value();
     * // => 'pebbles is 1'
     */
    function chain(value) {
      value = new lodashWrapper(value);
      value.__chain__ = true;
      return value;
    }

    /**
     * Invokes `interceptor` with the `value` as the first argument and then
     * returns `value`. The purpose of this method is to "tap into" a method
     * chain in order to perform operations on intermediate results within
     * the chain.
     *
     * @static
     * @memberOf _
     * @category Chaining
     * @param {*} value The value to provide to `interceptor`.
     * @param {Function} interceptor The function to invoke.
     * @returns {*} Returns `value`.
     * @example
     *
     * _([1, 2, 3, 4])
     *  .tap(function(array) { array.pop(); })
     *  .reverse()
     *  .value();
     * // => [3, 2, 1]
     */
    function tap(value, interceptor) {
      interceptor(value);
      return value;
    }

    /**
     * Enables explicit method chaining on the wrapper object.
     *
     * @name chain
     * @memberOf _
     * @category Chaining
     * @returns {*} Returns the wrapper object.
     * @example
     *
     * var characters = [
     *   { 'name': 'barney', 'age': 36 },
     *   { 'name': 'fred',   'age': 40 }
     * ];
     *
     * // without explicit chaining
     * _(characters).first();
     * // => { 'name': 'barney', 'age': 36 }
     *
     * // with explicit chaining
     * _(characters).chain()
     *   .first()
     *   .pick('age')
     *   .value()
     * // => { 'age': 36 }
     */
    function wrapperChain() {
      this.__chain__ = true;
      return this;
    }

    /**
     * Produces the `toString` result of the wrapped value.
     *
     * @name toString
     * @memberOf _
     * @category Chaining
     * @returns {string} Returns the string result.
     * @example
     *
     * _([1, 2, 3]).toString();
     * // => '1,2,3'
     */
    function wrapperToString() {
      return String(this.__wrapped__);
    }

    /**
     * Extracts the wrapped value.
     *
     * @name valueOf
     * @memberOf _
     * @alias value
     * @category Chaining
     * @returns {*} Returns the wrapped value.
     * @example
     *
     * _([1, 2, 3]).valueOf();
     * // => [1, 2, 3]
     */
    function wrapperValueOf() {
      return this.__wrapped__;
    }

    /*--------------------------------------------------------------------------*/

    // add functions that return wrapped values when chaining
    lodash.after = after;
    lodash.assign = assign;
    lodash.at = at;
    lodash.bind = bind;
    lodash.bindAll = bindAll;
    lodash.bindKey = bindKey;
    lodash.chain = chain;
    lodash.compact = compact;
    lodash.compose = compose;
    lodash.countBy = countBy;
    lodash.create = create;
    lodash.createCallback = createCallback;
    lodash.curry = curry;
    lodash.debounce = debounce;
    lodash.defaults = defaults;
    lodash.defer = defer;
    lodash.delay = delay;
    lodash.difference = difference;
    lodash.filter = filter;
    lodash.flatten = flatten;
    lodash.forEach = forEach;
    lodash.forEachRight = forEachRight;
    lodash.forIn = forIn;
    lodash.forInRight = forInRight;
    lodash.forOwn = forOwn;
    lodash.forOwnRight = forOwnRight;
    lodash.functions = functions;
    lodash.groupBy = groupBy;
    lodash.indexBy = indexBy;
    lodash.initial = initial;
    lodash.intersection = intersection;
    lodash.invert = invert;
    lodash.invoke = invoke;
    lodash.keys = keys;
    lodash.map = map;
    lodash.max = max;
    lodash.memoize = memoize;
    lodash.merge = merge;
    lodash.min = min;
    lodash.omit = omit;
    lodash.once = once;
    lodash.pairs = pairs;
    lodash.partial = partial;
    lodash.partialRight = partialRight;
    lodash.pick = pick;
    lodash.pluck = pluck;
    lodash.pull = pull;
    lodash.range = range;
    lodash.reject = reject;
    lodash.remove = remove;
    lodash.rest = rest;
    lodash.shuffle = shuffle;
    lodash.sortBy = sortBy;
    lodash.tap = tap;
    lodash.throttle = throttle;
    lodash.times = times;
    lodash.toArray = toArray;
    lodash.transform = transform;
    lodash.union = union;
    lodash.uniq = uniq;
    lodash.values = values;
    lodash.where = where;
    lodash.without = without;
    lodash.wrap = wrap;
    lodash.zip = zip;
    lodash.zipObject = zipObject;

    // add aliases
    lodash.collect = map;
    lodash.drop = rest;
    lodash.each = forEach;
    lodash.eachRight = forEachRight;
    lodash.extend = assign;
    lodash.methods = functions;
    lodash.object = zipObject;
    lodash.select = filter;
    lodash.tail = rest;
    lodash.unique = uniq;
    lodash.unzip = zip;

    // add functions to `lodash.prototype`
    mixin(lodash);

    /*--------------------------------------------------------------------------*/

    // add functions that return unwrapped values when chaining
    lodash.clone = clone;
    lodash.cloneDeep = cloneDeep;
    lodash.contains = contains;
    lodash.escape = escape;
    lodash.every = every;
    lodash.find = find;
    lodash.findIndex = findIndex;
    lodash.findKey = findKey;
    lodash.findLast = findLast;
    lodash.findLastIndex = findLastIndex;
    lodash.findLastKey = findLastKey;
    lodash.has = has;
    lodash.identity = identity;
    lodash.indexOf = indexOf;
    lodash.isArguments = isArguments;
    lodash.isArray = isArray;
    lodash.isBoolean = isBoolean;
    lodash.isDate = isDate;
    lodash.isElement = isElement;
    lodash.isEmpty = isEmpty;
    lodash.isEqual = isEqual;
    lodash.isFinite = isFinite;
    lodash.isFunction = isFunction;
    lodash.isNaN = isNaN;
    lodash.isNull = isNull;
    lodash.isNumber = isNumber;
    lodash.isObject = isObject;
    lodash.isPlainObject = isPlainObject;
    lodash.isRegExp = isRegExp;
    lodash.isString = isString;
    lodash.isUndefined = isUndefined;
    lodash.lastIndexOf = lastIndexOf;
    lodash.mixin = mixin;
    lodash.noConflict = noConflict;
    lodash.noop = noop;
    lodash.parseInt = parseInt;
    lodash.random = random;
    lodash.reduce = reduce;
    lodash.reduceRight = reduceRight;
    lodash.result = result;
    lodash.runInContext = runInContext;
    lodash.size = size;
    lodash.some = some;
    lodash.sortedIndex = sortedIndex;
    lodash.template = template;
    lodash.unescape = unescape;
    lodash.uniqueId = uniqueId;

    // add aliases
    lodash.all = every;
    lodash.any = some;
    lodash.detect = find;
    lodash.findWhere = find;
    lodash.foldl = reduce;
    lodash.foldr = reduceRight;
    lodash.include = contains;
    lodash.inject = reduce;

    forOwn(lodash, function(func, methodName) {
      if (!lodash.prototype[methodName]) {
        lodash.prototype[methodName] = function() {
          var args = [this.__wrapped__],
              chainAll = this.__chain__;

          push.apply(args, arguments);
          var result = func.apply(lodash, args);
          return chainAll
            ? new lodashWrapper(result, chainAll)
            : result;
        };
      }
    });

    /*--------------------------------------------------------------------------*/

    // add functions capable of returning wrapped and unwrapped values when chaining
    lodash.first = first;
    lodash.last = last;
    lodash.sample = sample;

    // add aliases
    lodash.take = first;
    lodash.head = first;

    forOwn(lodash, function(func, methodName) {
      var callbackable = methodName !== 'sample';
      if (!lodash.prototype[methodName]) {
        lodash.prototype[methodName]= function(n, guard) {
          var chainAll = this.__chain__,
              result = func(this.__wrapped__, n, guard);

          return !chainAll && (n == null || (guard && !(callbackable && typeof n == 'function')))
            ? result
            : new lodashWrapper(result, chainAll);
        };
      }
    });

    /*--------------------------------------------------------------------------*/

    /**
     * The semantic version number.
     *
     * @static
     * @memberOf _
     * @type string
     */
    lodash.VERSION = '2.3.0';

    // add "Chaining" functions to the wrapper
    lodash.prototype.chain = wrapperChain;
    lodash.prototype.toString = wrapperToString;
    lodash.prototype.value = wrapperValueOf;
    lodash.prototype.valueOf = wrapperValueOf;

    // add `Array` functions that return unwrapped values
    baseEach(['join', 'pop', 'shift'], function(methodName) {
      var func = arrayRef[methodName];
      lodash.prototype[methodName] = function() {
        var chainAll = this.__chain__,
            result = func.apply(this.__wrapped__, arguments);

        return chainAll
          ? new lodashWrapper(result, chainAll)
          : result;
      };
    });

    // add `Array` functions that return the wrapped value
    baseEach(['push', 'reverse', 'sort', 'unshift'], function(methodName) {
      var func = arrayRef[methodName];
      lodash.prototype[methodName] = function() {
        func.apply(this.__wrapped__, arguments);
        return this;
      };
    });

    // add `Array` functions that return new wrapped values
    baseEach(['concat', 'slice', 'splice'], function(methodName) {
      var func = arrayRef[methodName];
      lodash.prototype[methodName] = function() {
        return new lodashWrapper(func.apply(this.__wrapped__, arguments), this.__chain__);
      };
    });

    // avoid array-like object bugs with `Array#shift` and `Array#splice`
    // in IE < 9, Firefox < 10, Narwhal, and RingoJS
    if (!support.spliceObjects) {
      baseEach(['pop', 'shift', 'splice'], function(methodName) {
        var func = arrayRef[methodName],
            isSplice = methodName == 'splice';

        lodash.prototype[methodName] = function() {
          var chainAll = this.__chain__,
              value = this.__wrapped__,
              result = func.apply(value, arguments);

          if (value.length === 0) {
            delete value[0];
          }
          return (chainAll || isSplice)
            ? new lodashWrapper(result, chainAll)
            : result;
        };
      });
    }

    // add pseudo private property to be used and removed during the build process
    lodash._baseEach = baseEach;
    lodash._iteratorTemplate = iteratorTemplate;
    lodash._shimKeys = shimKeys;

    return lodash;
  }

  /*--------------------------------------------------------------------------*/

  // expose Lo-Dash
  var _ = runInContext();

  // some AMD build optimizers like r.js check for condition patterns like the following:
  if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
    // Expose Lo-Dash to the global object even when an AMD loader is present in
    // case Lo-Dash was injected by a third-party script and not intended to be
    // loaded as a module. The global assignment can be reverted in the Lo-Dash
    // module by its `noConflict()` method.
    root._ = _;

    // define as an anonymous module so, through path mapping, it can be
    // referenced as the "underscore" module
    define('lodash',[],function() {
      return _;
    });
  }
  // check for `exports` after `define` in case a build optimizer adds an `exports` object
  else if (freeExports && freeModule) {
    // in Node.js or RingoJS
    if (moduleExports) {
      (freeModule.exports = _)._ = _;
    }
    // in Narwhal or Rhino -require
    else {
      freeExports._ = _;
    }
  }
  else {
    // in a browser or Rhino
    root._ = _;
  }
}.call(this));

//  Underscore.string
//  (c) 2010 Esa-Matti Suuronen <esa-matti aet suuronen dot org>
//  Underscore.string is freely distributable under the terms of the MIT license.
//  Documentation: https://github.com/epeli/underscore.string
//  Some code is borrowed from MooTools and Alexandru Marasteanu.
//  Version '2.3.2'

!function(root, String){
  

  // Defining helper functions.

  var nativeTrim = String.prototype.trim;
  var nativeTrimRight = String.prototype.trimRight;
  var nativeTrimLeft = String.prototype.trimLeft;

  var parseNumber = function(source) { return source * 1 || 0; };

  var strRepeat = function(str, qty){
    if (qty < 1) return '';
    var result = '';
    while (qty > 0) {
      if (qty & 1) result += str;
      qty >>= 1, str += str;
    }
    return result;
  };

  var slice = [].slice;

  var defaultToWhiteSpace = function(characters) {
    if (characters == null)
      return '\\s';
    else if (characters.source)
      return characters.source;
    else
      return '[' + _s.escapeRegExp(characters) + ']';
  };

  // Helper for toBoolean
  function boolMatch(s, matchers) {
    var i, matcher, down = s.toLowerCase();
    matchers = [].concat(matchers);
    for (i = 0; i < matchers.length; i += 1) {
      matcher = matchers[i];
      if (!matcher) continue;
      if (matcher.test && matcher.test(s)) return true;
      if (matcher.toLowerCase() === down) return true;
    }
  }

  var escapeChars = {
    lt: '<',
    gt: '>',
    quot: '"',
    amp: '&',
    apos: "'"
  };

  var reversedEscapeChars = {};
  for(var key in escapeChars) reversedEscapeChars[escapeChars[key]] = key;
  reversedEscapeChars["'"] = '#39';

  // sprintf() for JavaScript 0.7-beta1
  // http://www.diveintojavascript.com/projects/javascript-sprintf
  //
  // Copyright (c) Alexandru Marasteanu <alexaholic [at) gmail (dot] com>
  // All rights reserved.

  var sprintf = (function() {
    function get_type(variable) {
      return Object.prototype.toString.call(variable).slice(8, -1).toLowerCase();
    }

    var str_repeat = strRepeat;

    var str_format = function() {
      if (!str_format.cache.hasOwnProperty(arguments[0])) {
        str_format.cache[arguments[0]] = str_format.parse(arguments[0]);
      }
      return str_format.format.call(null, str_format.cache[arguments[0]], arguments);
    };

    str_format.format = function(parse_tree, argv) {
      var cursor = 1, tree_length = parse_tree.length, node_type = '', arg, output = [], i, k, match, pad, pad_character, pad_length;
      for (i = 0; i < tree_length; i++) {
        node_type = get_type(parse_tree[i]);
        if (node_type === 'string') {
          output.push(parse_tree[i]);
        }
        else if (node_type === 'array') {
          match = parse_tree[i]; // convenience purposes only
          if (match[2]) { // keyword argument
            arg = argv[cursor];
            for (k = 0; k < match[2].length; k++) {
              if (!arg.hasOwnProperty(match[2][k])) {
                throw new Error(sprintf('[_.sprintf] property "%s" does not exist', match[2][k]));
              }
              arg = arg[match[2][k]];
            }
          } else if (match[1]) { // positional argument (explicit)
            arg = argv[match[1]];
          }
          else { // positional argument (implicit)
            arg = argv[cursor++];
          }

          if (/[^s]/.test(match[8]) && (get_type(arg) != 'number')) {
            throw new Error(sprintf('[_.sprintf] expecting number but found %s', get_type(arg)));
          }
          switch (match[8]) {
            case 'b': arg = arg.toString(2); break;
            case 'c': arg = String.fromCharCode(arg); break;
            case 'd': arg = parseInt(arg, 10); break;
            case 'e': arg = match[7] ? arg.toExponential(match[7]) : arg.toExponential(); break;
            case 'f': arg = match[7] ? parseFloat(arg).toFixed(match[7]) : parseFloat(arg); break;
            case 'o': arg = arg.toString(8); break;
            case 's': arg = ((arg = String(arg)) && match[7] ? arg.substring(0, match[7]) : arg); break;
            case 'u': arg = Math.abs(arg); break;
            case 'x': arg = arg.toString(16); break;
            case 'X': arg = arg.toString(16).toUpperCase(); break;
          }
          arg = (/[def]/.test(match[8]) && match[3] && arg >= 0 ? '+'+ arg : arg);
          pad_character = match[4] ? match[4] == '0' ? '0' : match[4].charAt(1) : ' ';
          pad_length = match[6] - String(arg).length;
          pad = match[6] ? str_repeat(pad_character, pad_length) : '';
          output.push(match[5] ? arg + pad : pad + arg);
        }
      }
      return output.join('');
    };

    str_format.cache = {};

    str_format.parse = function(fmt) {
      var _fmt = fmt, match = [], parse_tree = [], arg_names = 0;
      while (_fmt) {
        if ((match = /^[^\x25]+/.exec(_fmt)) !== null) {
          parse_tree.push(match[0]);
        }
        else if ((match = /^\x25{2}/.exec(_fmt)) !== null) {
          parse_tree.push('%');
        }
        else if ((match = /^\x25(?:([1-9]\d*)\$|\(([^\)]+)\))?(\+)?(0|'[^$])?(-)?(\d+)?(?:\.(\d+))?([b-fosuxX])/.exec(_fmt)) !== null) {
          if (match[2]) {
            arg_names |= 1;
            var field_list = [], replacement_field = match[2], field_match = [];
            if ((field_match = /^([a-z_][a-z_\d]*)/i.exec(replacement_field)) !== null) {
              field_list.push(field_match[1]);
              while ((replacement_field = replacement_field.substring(field_match[0].length)) !== '') {
                if ((field_match = /^\.([a-z_][a-z_\d]*)/i.exec(replacement_field)) !== null) {
                  field_list.push(field_match[1]);
                }
                else if ((field_match = /^\[(\d+)\]/.exec(replacement_field)) !== null) {
                  field_list.push(field_match[1]);
                }
                else {
                  throw new Error('[_.sprintf] huh?');
                }
              }
            }
            else {
              throw new Error('[_.sprintf] huh?');
            }
            match[2] = field_list;
          }
          else {
            arg_names |= 2;
          }
          if (arg_names === 3) {
            throw new Error('[_.sprintf] mixing positional and named placeholders is not (yet) supported');
          }
          parse_tree.push(match);
        }
        else {
          throw new Error('[_.sprintf] huh?');
        }
        _fmt = _fmt.substring(match[0].length);
      }
      return parse_tree;
    };

    return str_format;
  })();



  // Defining underscore.string

  var _s = {

    VERSION: '2.3.0',

    isBlank: function(str){
      if (str == null) str = '';
      return (/^\s*$/).test(str);
    },

    stripTags: function(str){
      if (str == null) return '';
      return String(str).replace(/<\/?[^>]+>/g, '');
    },

    capitalize : function(str){
      str = str == null ? '' : String(str);
      return str.charAt(0).toUpperCase() + str.slice(1);
    },

    chop: function(str, step){
      if (str == null) return [];
      str = String(str);
      step = ~~step;
      return step > 0 ? str.match(new RegExp('.{1,' + step + '}', 'g')) : [str];
    },

    clean: function(str){
      return _s.strip(str).replace(/\s+/g, ' ');
    },

    count: function(str, substr){
      if (str == null || substr == null) return 0;

      str = String(str);
      substr = String(substr);

      var count = 0,
        pos = 0,
        length = substr.length;

      while (true) {
        pos = str.indexOf(substr, pos);
        if (pos === -1) break;
        count++;
        pos += length;
      }

      return count;
    },

    chars: function(str) {
      if (str == null) return [];
      return String(str).split('');
    },

    swapCase: function(str) {
      if (str == null) return '';
      return String(str).replace(/\S/g, function(c){
        return c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
      });
    },

    escapeHTML: function(str) {
      if (str == null) return '';
      return String(str).replace(/[&<>"']/g, function(m){ return '&' + reversedEscapeChars[m] + ';'; });
    },

    unescapeHTML: function(str) {
      if (str == null) return '';
      return String(str).replace(/\&([^;]+);/g, function(entity, entityCode){
        var match;

        if (entityCode in escapeChars) {
          return escapeChars[entityCode];
        } else if (match = entityCode.match(/^#x([\da-fA-F]+)$/)) {
          return String.fromCharCode(parseInt(match[1], 16));
        } else if (match = entityCode.match(/^#(\d+)$/)) {
          return String.fromCharCode(~~match[1]);
        } else {
          return entity;
        }
      });
    },

    escapeRegExp: function(str){
      if (str == null) return '';
      return String(str).replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1');
    },

    splice: function(str, i, howmany, substr){
      var arr = _s.chars(str);
      arr.splice(~~i, ~~howmany, substr);
      return arr.join('');
    },

    insert: function(str, i, substr){
      return _s.splice(str, i, 0, substr);
    },

    include: function(str, needle){
      if (needle === '') return true;
      if (str == null) return false;
      return String(str).indexOf(needle) !== -1;
    },

    join: function() {
      var args = slice.call(arguments),
        separator = args.shift();

      if (separator == null) separator = '';

      return args.join(separator);
    },

    lines: function(str) {
      if (str == null) return [];
      return String(str).split("\n");
    },

    reverse: function(str){
      return _s.chars(str).reverse().join('');
    },

    startsWith: function(str, starts){
      if (starts === '') return true;
      if (str == null || starts == null) return false;
      str = String(str); starts = String(starts);
      return str.length >= starts.length && str.slice(0, starts.length) === starts;
    },

    endsWith: function(str, ends){
      if (ends === '') return true;
      if (str == null || ends == null) return false;
      str = String(str); ends = String(ends);
      return str.length >= ends.length && str.slice(str.length - ends.length) === ends;
    },

    succ: function(str){
      if (str == null) return '';
      str = String(str);
      return str.slice(0, -1) + String.fromCharCode(str.charCodeAt(str.length-1) + 1);
    },

    titleize: function(str){
      if (str == null) return '';
      str  = String(str).toLowerCase();
      return str.replace(/(?:^|\s|-)\S/g, function(c){ return c.toUpperCase(); });
    },

    camelize: function(str){
      return _s.trim(str).replace(/[-_\s]+(.)?/g, function(match, c){ return c ? c.toUpperCase() : ""; });
    },

    underscored: function(str){
      return _s.trim(str).replace(/([a-z\d])([A-Z]+)/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase();
    },

    dasherize: function(str){
      return _s.trim(str).replace(/([A-Z])/g, '-$1').replace(/[-_\s]+/g, '-').toLowerCase();
    },

    classify: function(str){
      return _s.titleize(String(str).replace(/[\W_]/g, ' ')).replace(/\s/g, '');
    },

    humanize: function(str){
      return _s.capitalize(_s.underscored(str).replace(/_id$/,'').replace(/_/g, ' '));
    },

    trim: function(str, characters){
      if (str == null) return '';
      if (!characters && nativeTrim) return nativeTrim.call(str);
      characters = defaultToWhiteSpace(characters);
      return String(str).replace(new RegExp('\^' + characters + '+|' + characters + '+$', 'g'), '');
    },

    ltrim: function(str, characters){
      if (str == null) return '';
      if (!characters && nativeTrimLeft) return nativeTrimLeft.call(str);
      characters = defaultToWhiteSpace(characters);
      return String(str).replace(new RegExp('^' + characters + '+'), '');
    },

    rtrim: function(str, characters){
      if (str == null) return '';
      if (!characters && nativeTrimRight) return nativeTrimRight.call(str);
      characters = defaultToWhiteSpace(characters);
      return String(str).replace(new RegExp(characters + '+$'), '');
    },

    truncate: function(str, length, truncateStr){
      if (str == null) return '';
      str = String(str); truncateStr = truncateStr || '...';
      length = ~~length;
      return str.length > length ? str.slice(0, length) + truncateStr : str;
    },

    /**
     * _s.prune: a more elegant version of truncate
     * prune extra chars, never leaving a half-chopped word.
     * @author github.com/rwz
     */
    prune: function(str, length, pruneStr){
      if (str == null) return '';

      str = String(str); length = ~~length;
      pruneStr = pruneStr != null ? String(pruneStr) : '...';

      if (str.length <= length) return str;

      var tmpl = function(c){ return c.toUpperCase() !== c.toLowerCase() ? 'A' : ' '; },
        template = str.slice(0, length+1).replace(/.(?=\W*\w*$)/g, tmpl); // 'Hello, world' -> 'HellAA AAAAA'

      if (template.slice(template.length-2).match(/\w\w/))
        template = template.replace(/\s*\S+$/, '');
      else
        template = _s.rtrim(template.slice(0, template.length-1));

      return (template+pruneStr).length > str.length ? str : str.slice(0, template.length)+pruneStr;
    },

    words: function(str, delimiter) {
      if (_s.isBlank(str)) return [];
      return _s.trim(str, delimiter).split(delimiter || /\s+/);
    },

    pad: function(str, length, padStr, type) {
      str = str == null ? '' : String(str);
      length = ~~length;

      var padlen  = 0;

      if (!padStr)
        padStr = ' ';
      else if (padStr.length > 1)
        padStr = padStr.charAt(0);

      switch(type) {
        case 'right':
          padlen = length - str.length;
          return str + strRepeat(padStr, padlen);
        case 'both':
          padlen = length - str.length;
          return strRepeat(padStr, Math.ceil(padlen/2)) + str
                  + strRepeat(padStr, Math.floor(padlen/2));
        default: // 'left'
          padlen = length - str.length;
          return strRepeat(padStr, padlen) + str;
        }
    },

    lpad: function(str, length, padStr) {
      return _s.pad(str, length, padStr);
    },

    rpad: function(str, length, padStr) {
      return _s.pad(str, length, padStr, 'right');
    },

    lrpad: function(str, length, padStr) {
      return _s.pad(str, length, padStr, 'both');
    },

    sprintf: sprintf,

    vsprintf: function(fmt, argv){
      argv.unshift(fmt);
      return sprintf.apply(null, argv);
    },

    toNumber: function(str, decimals) {
      if (!str) return 0;
      str = _s.trim(str);
      if (!str.match(/^-?\d+(?:\.\d+)?$/)) return NaN;
      return parseNumber(parseNumber(str).toFixed(~~decimals));
    },

    numberFormat : function(number, dec, dsep, tsep) {
      if (isNaN(number) || number == null) return '';

      number = number.toFixed(~~dec);
      tsep = typeof tsep == 'string' ? tsep : ',';

      var parts = number.split('.'), fnums = parts[0],
        decimals = parts[1] ? (dsep || '.') + parts[1] : '';

      return fnums.replace(/(\d)(?=(?:\d{3})+$)/g, '$1' + tsep) + decimals;
    },

    strRight: function(str, sep){
      if (str == null) return '';
      str = String(str); sep = sep != null ? String(sep) : sep;
      var pos = !sep ? -1 : str.indexOf(sep);
      return ~pos ? str.slice(pos+sep.length, str.length) : str;
    },

    strRightBack: function(str, sep){
      if (str == null) return '';
      str = String(str); sep = sep != null ? String(sep) : sep;
      var pos = !sep ? -1 : str.lastIndexOf(sep);
      return ~pos ? str.slice(pos+sep.length, str.length) : str;
    },

    strLeft: function(str, sep){
      if (str == null) return '';
      str = String(str); sep = sep != null ? String(sep) : sep;
      var pos = !sep ? -1 : str.indexOf(sep);
      return ~pos ? str.slice(0, pos) : str;
    },

    strLeftBack: function(str, sep){
      if (str == null) return '';
      str += ''; sep = sep != null ? ''+sep : sep;
      var pos = str.lastIndexOf(sep);
      return ~pos ? str.slice(0, pos) : str;
    },

    toSentence: function(array, separator, lastSeparator, serial) {
      separator = separator || ', ';
      lastSeparator = lastSeparator || ' and ';
      var a = array.slice(), lastMember = a.pop();

      if (array.length > 2 && serial) lastSeparator = _s.rtrim(separator) + lastSeparator;

      return a.length ? a.join(separator) + lastSeparator + lastMember : lastMember;
    },

    toSentenceSerial: function() {
      var args = slice.call(arguments);
      args[3] = true;
      return _s.toSentence.apply(_s, args);
    },

    slugify: function(str) {
      if (str == null) return '';

      var from  = "ąàáäâãåæăćęèéëêìíïîłńòóöôõøśșțùúüûñçżź",
          to    = "aaaaaaaaaceeeeeiiiilnoooooosstuuuunczz",
          regex = new RegExp(defaultToWhiteSpace(from), 'g');

      str = String(str).toLowerCase().replace(regex, function(c){
        var index = from.indexOf(c);
        return to.charAt(index) || '-';
      });

      return _s.dasherize(str.replace(/[^\w\s-]/g, ''));
    },

    surround: function(str, wrapper) {
      return [wrapper, str, wrapper].join('');
    },

    quote: function(str, quoteChar) {
      return _s.surround(str, quoteChar || '"');
    },

    unquote: function(str, quoteChar) {
      quoteChar = quoteChar || '"';
      if (str[0] === quoteChar && str[str.length-1] === quoteChar)
        return str.slice(1,str.length-1);
      else return str;
    },

    exports: function() {
      var result = {};

      for (var prop in this) {
        if (!this.hasOwnProperty(prop) || prop.match(/^(?:include|contains|reverse)$/)) continue;
        result[prop] = this[prop];
      }

      return result;
    },

    repeat: function(str, qty, separator){
      if (str == null) return '';

      qty = ~~qty;

      // using faster implementation if separator is not needed;
      if (separator == null) return strRepeat(String(str), qty);

      // this one is about 300x slower in Google Chrome
      for (var repeat = []; qty > 0; repeat[--qty] = str) {}
      return repeat.join(separator);
    },

    naturalCmp: function(str1, str2){
      if (str1 == str2) return 0;
      if (!str1) return -1;
      if (!str2) return 1;

      var cmpRegex = /(\.\d+)|(\d+)|(\D+)/g,
        tokens1 = String(str1).toLowerCase().match(cmpRegex),
        tokens2 = String(str2).toLowerCase().match(cmpRegex),
        count = Math.min(tokens1.length, tokens2.length);

      for(var i = 0; i < count; i++) {
        var a = tokens1[i], b = tokens2[i];

        if (a !== b){
          var num1 = parseInt(a, 10);
          if (!isNaN(num1)){
            var num2 = parseInt(b, 10);
            if (!isNaN(num2) && num1 - num2)
              return num1 - num2;
          }
          return a < b ? -1 : 1;
        }
      }

      if (tokens1.length === tokens2.length)
        return tokens1.length - tokens2.length;

      return str1 < str2 ? -1 : 1;
    },

    levenshtein: function(str1, str2) {
      if (str1 == null && str2 == null) return 0;
      if (str1 == null) return String(str2).length;
      if (str2 == null) return String(str1).length;

      str1 = String(str1); str2 = String(str2);

      var current = [], prev, value;

      for (var i = 0; i <= str2.length; i++)
        for (var j = 0; j <= str1.length; j++) {
          if (i && j)
            if (str1.charAt(j - 1) === str2.charAt(i - 1))
              value = prev;
            else
              value = Math.min(current[j], current[j - 1], prev) + 1;
          else
            value = i + j;

          prev = current[j];
          current[j] = value;
        }

      return current.pop();
    },

    toBoolean: function(str, trueValues, falseValues) {
      if (typeof str === "number") str = "" + str;
      if (typeof str !== "string") return !!str;
      str = _s.trim(str);
      if (boolMatch(str, trueValues || ["true", "1"])) return true;
      if (boolMatch(str, falseValues || ["false", "0"])) return false;
    }
  };

  // Aliases

  _s.strip    = _s.trim;
  _s.lstrip   = _s.ltrim;
  _s.rstrip   = _s.rtrim;
  _s.center   = _s.lrpad;
  _s.rjust    = _s.lpad;
  _s.ljust    = _s.rpad;
  _s.contains = _s.include;
  _s.q        = _s.quote;
  _s.toBool   = _s.toBoolean;

  // Exporting

  // CommonJS module is defined
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports)
      module.exports = _s;

    exports._s = _s;
  }

  // Register as a named module with AMD.
  if (typeof define === 'function' && define.amd)
    define('underscore.string', [], function(){ return _s; });


  // Integrate with Underscore.js if defined
  // or create our own underscore object.
  root._ = root._ || {};
  root._.string = root._.str = _s;
}(this, String);

/* parser generated by jison 0.4.15 */
/*
  Returns a Parser object of the following structure:

  Parser: {
    yy: {}
  }

  Parser.prototype: {
    yy: {},
    trace: function(),
    symbols_: {associative list: name ==> number},
    terminals_: {associative list: number ==> name},
    productions_: [...],
    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),
    table: [...],
    defaultActions: {...},
    parseError: function(str, hash),
    parse: function(input),

    lexer: {
        EOF: 1,
        parseError: function(str, hash),
        setInput: function(input),
        input: function(),
        unput: function(str),
        more: function(),
        less: function(n),
        pastInput: function(),
        upcomingInput: function(),
        showPosition: function(),
        test_match: function(regex_match_array, rule_index),
        next: function(),
        lex: function(),
        begin: function(condition),
        popState: function(),
        _currentRules: function(),
        topState: function(),
        pushState: function(condition),

        options: {
            ranges: boolean           (optional: true ==> token location info will include a .range[] member)
            flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)
            backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)
        },

        performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),
        rules: [...],
        conditions: {associative list: name ==> set},
    }
  }


  token location info (@$, _$, etc.): {
    first_line: n,
    last_line: n,
    first_column: n,
    last_column: n,
    range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)
  }


  the parseError function receives a 'hash' object with these members for lexer and parser errors: {
    text:        (matched text)
    token:       (the produced terminal token, if any)
    line:        (yylineno)
  }
  while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {
    loc:         (yylloc)
    expected:    (string describing the set of expected tokens)
    recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)
  }
*/
var parser = (function(){
var o=function(k,v,o,l){for(o=o||{},l=k.length;l--;o[k[l]]=v);return o},$V0=[1,14],$V1=[1,30],$V2=[1,31],$V3=[1,47],$V4=[1,44],$V5=[1,53],$V6=[1,49],$V7=[1,50],$V8=[1,51],$V9=[1,52],$Va=[1,16],$Vb=[1,17],$Vc=[1,20],$Vd=[1,19],$Ve=[1,18],$Vf=[1,55],$Vg=[1,13],$Vh=[1,14,25,33,50,57,62,65,66,67,68,70,71,72,74,75,76,86],$Vi=[25,33],$Vj=[1,14,25,33,50,57,62,65,66,67,68,70,71,72,73,74,75,76,86],$Vk=[14,63,69,77],$Vl=[14,17,63,69,77,78,79,80,81,82],$Vm=[1,75],$Vn=[14,17,33,35,45,46,49,50,52,53,57,60,62,63,64,69,76,77,78,79,80,81,82],$Vo=[2,67],$Vp=[2,29],$Vq=[1,76],$Vr=[1,78],$Vs=[14,17,33,35,45,46,63,69,77,78,79,80,81,82],$Vt=[14,17,33,35,45,46,49,50,63,69,77,78,79,80,81,82],$Vu=[1,85],$Vv=[1,86],$Vw=[14,17,33,35,45,46,49,50,52,53,63,69,77,78,79,80,81,82],$Vx=[1,89],$Vy=[14,17,33,35,45,46,49,50,52,53,60,63,69,77,78,79,80,81,82],$Vz=[1,94],$VA=[1,92],$VB=[1,93],$VC=[1,100],$VD=[25,33,50,57,62,65,66,67,68,76];
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"Program":3,"ProgramSectionList":4,"ProgramSection":5,"StatementList":6,"FunctionDefinition":7,"Statement":8,"ExpressionStatement":9,"LoopStatement":10,"SelectionStatement":11,"JumpStatement":12,"CodeSegment":13,"SEMICOLON":14,"Expression":15,"ChuckExpression":16,"COMMA":17,"ArrowExpression":18,"ChuckOperator":19,"DeclExpression":20,"ConditionalExpression":21,"TypeDecl":22,"VarDeclList":23,"VarDecl":24,"ID":25,"ArrayExpression":26,"ArrayEmpty":27,"Literal":28,"NULL":29,"TypeDeclA":30,"TypeDeclB":31,"AT_SYM":32,"LT":33,"IdDot":34,"GT":35,"TypeDecl2":36,"LogicalOrExpression":37,"LogicalAndExpression":38,"InclusiveOrExpression":39,"ExclusiveOrExpression":40,"AndExpression":41,"EqualityExpression":42,"RelationalExpression":43,"ShiftExpression":44,"LE":45,"GE":46,"AdditiveExpression":47,"MultiplicativeExpression":48,"PLUS":49,"MINUS":50,"TildaExpression":51,"TIMES":52,"DIVIDE":53,"CastExpression":54,"UnaryExpression":55,"DurExpression":56,"PLUSPLUS":57,"UnaryOperator":58,"PostfixExpression":59,"COLONCOLON":60,"PrimaryExpression":61,"LPAREN":62,"RPAREN":63,"DOT":64,"NUMBER":65,"FLOAT":66,"STRING_LIT":67,"L_HACK":68,"R_HACK":69,"WHILE":70,"FOR":71,"LBRACE":72,"RBRACE":73,"BREAK":74,"IF":75,"LBRACK":76,"RBRACK":77,"CHUCK":78,"AT_CHUCK":79,"PLUS_CHUCK":80,"MINUS_CHUCK":81,"UNCHUCK":82,"FunctionDeclaration":83,"StaticDecl":84,"ArgList":85,"FUNCTION":86,"$accept":0,"$end":1},
terminals_: {2:"error",14:"SEMICOLON",17:"COMMA",25:"ID",29:"NULL",32:"AT_SYM",33:"LT",35:"GT",45:"LE",46:"GE",49:"PLUS",50:"MINUS",52:"TIMES",53:"DIVIDE",57:"PLUSPLUS",60:"COLONCOLON",62:"LPAREN",63:"RPAREN",64:"DOT",65:"NUMBER",66:"FLOAT",67:"STRING_LIT",68:"L_HACK",69:"R_HACK",70:"WHILE",71:"FOR",72:"LBRACE",73:"RBRACE",74:"BREAK",75:"IF",76:"LBRACK",77:"RBRACK",78:"CHUCK",79:"AT_CHUCK",80:"PLUS_CHUCK",81:"MINUS_CHUCK",82:"UNCHUCK",86:"FUNCTION"},
productions_: [0,[3,1],[4,1],[4,2],[5,1],[5,1],[6,1],[6,2],[8,1],[8,1],[8,1],[8,1],[8,1],[9,1],[9,2],[15,1],[15,3],[16,1],[16,3],[18,1],[20,1],[20,2],[23,1],[24,1],[24,2],[24,2],[28,1],[22,1],[22,1],[30,1],[30,2],[31,3],[31,4],[36,1],[21,1],[37,1],[38,1],[39,1],[40,1],[41,1],[42,1],[43,1],[43,3],[43,3],[43,3],[43,3],[44,1],[47,1],[47,3],[47,3],[48,1],[48,3],[48,3],[51,1],[54,1],[55,1],[55,2],[55,2],[58,1],[56,1],[56,3],[59,1],[59,2],[59,4],[59,3],[59,3],[59,2],[61,1],[61,1],[61,1],[61,1],[61,3],[61,3],[61,1],[10,5],[10,7],[13,2],[13,3],[12,2],[11,5],[34,1],[34,3],[26,3],[27,2],[19,1],[19,1],[19,1],[19,1],[19,1],[7,8],[7,7],[85,2],[85,4],[83,1],[84,0]],
performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */) {
/* this == yyval */

var $0 = $$.length - 1;
switch (yystate) {
case 1:
return this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.Program($$[$0]));
break;
case 2: case 6: case 22: case 80:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])([$$[$0]]);
break;
case 3: case 7:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])([$$[$0-1]].concat($$[$0]));
break;
case 4: case 5: case 8: case 9: case 10: case 11: case 12: case 17: case 19: case 20: case 27: case 28: case 33: case 34: case 35: case 36: case 37: case 38: case 39: case 40: case 41: case 46: case 47: case 50: case 53: case 54: case 55: case 59: case 61:
this.$ = $$[$0];
break;
case 13:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(void 0);
break;
case 14:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])(new yy.ExpressionStatement($$[$0-1]));
break;
case 15:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.ExpressionList($$[$0]));
break;
case 16:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])($$[$0].prepend($$[$0-2]));
break;
case 18:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.BinaryExpression($$[$0-2], $$[$0-1], $$[$0]));
break;
case 21:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])(new yy.DeclarationExpression($$[$0-1], $$[$0], 0));
break;
case 23:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.VariableDeclaration($$[$0]));
break;
case 24: case 25:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])(new yy.VariableDeclaration($$[$0-1], $$[$0]));
break;
case 26:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.Null);
break;
case 29:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.TypeDeclaration($$[$0], 0));
break;
case 30:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])(new yy.TypeDeclaration($$[$0-1], 1));
break;
case 31:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.TypeDeclaration($$[$0-1], 0));
break;
case 32:
this.$ = yy.addLocationDataFn(_$[$0-3], _$[$0])(new yy.TypeDeclaration($$[$0-2], 1));
break;
case 42:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.BinaryExpression($$[$0-2], new yy.LtOperator(), $$[$0]));
break;
case 43:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.BinaryExpression($$[$0-2], new yy.GtOperator(), $$[$0]));
break;
case 44:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.BinaryExpression($$[$0-2], new yy.LeOperator(), $$[$0]));
break;
case 45:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.BinaryExpression($$[$0-2], new yy.GeOperator(), $$[$0]));
break;
case 48:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.BinaryExpression($$[$0-2], new yy.PlusOperator(), $$[$0]));
break;
case 49:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.BinaryExpression($$[$0-2], new yy.MinusOperator(), $$[$0]));
break;
case 51:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.BinaryExpression($$[$0-2], new yy.TimesOperator(), $$[$0]));
break;
case 52:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.BinaryExpression($$[$0-2], new yy.DivideOperator(), $$[$0]));
break;
case 56:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])(new yy.UnaryExpression(new yy.PrefixPlusPlusOperator(), $$[$0]));
break;
case 57:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])(new yy.UnaryExpression($$[$0-1], $$[$0]));
break;
case 58:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.UnaryMinusOperator());
break;
case 60:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.DurExpression($$[$0-2], $$[$0]));
break;
case 62:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])(new yy.ArrayExpression($$[$0-1], $$[$0]));
break;
case 63:
this.$ = yy.addLocationDataFn(_$[$0-3], _$[$0])(new yy.FuncCallExpression($$[$0-3], $$[$0-1]));
break;
case 64:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.FuncCallExpression($$[$0-2]));
break;
case 65:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.DotMemberExpression($$[$0-2], $$[$0]));
break;
case 66:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])(new yy.PostfixExpression($$[$0-1], new yy.PostfixPlusPlusOperator()));
break;
case 67:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.PrimaryVariableExpression($$[$0]));
break;
case 68:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.PrimaryIntExpression($$[$0]));
break;
case 69:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.PrimaryFloatExpression($$[$0]));
break;
case 70:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.PrimaryStringExpression($$[$0]));
break;
case 71:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.PrimaryHackExpression($$[$0-1]));
break;
case 72:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])($$[$0-1]);
break;
case 73:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.PrimaryArrayExpression($$[$0]));
break;
case 74:
this.$ = yy.addLocationDataFn(_$[$0-4], _$[$0])(new yy.WhileStatement($$[$0-2], $$[$0]));
break;
case 75:
this.$ = yy.addLocationDataFn(_$[$0-6], _$[$0])(new yy.ForStatement($$[$0-4], $$[$0-3], $$[$0-2], $$[$0]));
break;
case 76:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])(new yy.CodeStatement());
break;
case 77:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.CodeStatement($$[$0-1]));
break;
case 78:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])(new yy.BreakStatement());
break;
case 79:
this.$ = yy.addLocationDataFn(_$[$0-4], _$[$0])(new yy.IfStatement($$[$0-2], $$[$0]));
break;
case 81:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])($$[$0].push($$[$0-2]));
break;
case 82:
this.$ = yy.addLocationDataFn(_$[$0-2], _$[$0])(new yy.ArraySub($$[$0-1]));
break;
case 83:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])(new yy.ArraySub());
break;
case 84:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.ChuckOperator());
break;
case 85:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.AtChuckOperator());
break;
case 86:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.PlusChuckOperator());
break;
case 87:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.MinusChuckOperator());
break;
case 88:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])(new yy.UnchuckOperator());
break;
case 89:
this.$ = yy.addLocationDataFn(_$[$0-7], _$[$0])(new yy.FunctionDefinition($$[$0-7], $$[$0-6], $$[$0-5], $$[$0-4], $$[$0-2], $$[$0]));
break;
case 90:
this.$ = yy.addLocationDataFn(_$[$0-6], _$[$0])(new yy.FunctionDefinition($$[$0-6], $$[$0-5], $$[$0-4], $$[$0-3], [], $$[$0]));
break;
case 91:
this.$ = yy.addLocationDataFn(_$[$0-1], _$[$0])([new yy.Arg($$[$0-1], $$[$0])]);
break;
case 92:
this.$ = yy.addLocationDataFn(_$[$0-3], _$[$0])([new yy.Arg($$[$0-3], $$[$0-2])].concat($$[$0]));
break;
case 93: case 94:
this.$ = yy.addLocationDataFn(_$[$0], _$[$0])((function () {}()));
break;
}
},
table: [{3:1,4:2,5:3,6:4,7:5,8:6,9:8,10:9,11:10,12:11,13:12,14:$V0,15:15,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,70:$Va,71:$Vb,72:$Vc,74:$Vd,75:$Ve,76:$Vf,83:7,86:$Vg},{1:[3]},{1:[2,1]},{1:[2,2],4:56,5:3,6:4,7:5,8:6,9:8,10:9,11:10,12:11,13:12,14:$V0,15:15,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,70:$Va,71:$Vb,72:$Vc,74:$Vd,75:$Ve,76:$Vf,83:7,86:$Vg},o($Vh,[2,4]),o($Vh,[2,5]),o([1,73,86],[2,6],{8:6,9:8,10:9,11:10,12:11,13:12,15:15,16:21,18:22,20:23,21:24,22:25,37:26,30:27,31:28,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,51:40,54:41,55:42,56:43,58:45,59:46,61:48,26:54,6:57,14:$V0,25:$V1,33:$V2,50:$V3,57:$V4,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,70:$Va,71:$Vb,72:$Vc,74:$Vd,75:$Ve,76:$Vf}),o($Vi,[2,94],{84:58}),o($Vj,[2,8]),o($Vj,[2,9]),o($Vj,[2,10]),o($Vj,[2,11]),o($Vj,[2,12]),o($Vi,[2,93]),o($Vj,[2,13]),{14:[1,59]},{62:[1,60]},{62:[1,61]},{62:[1,62]},{14:[1,63]},{6:65,8:6,9:8,10:9,11:10,12:11,13:12,14:$V0,15:15,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,70:$Va,71:$Vb,72:$Vc,73:[1,64],74:$Vd,75:$Ve,76:$Vf},o($Vk,[2,15],{19:67,17:[1,66],78:[1,68],79:[1,69],80:[1,70],81:[1,71],82:[1,72]}),o($Vl,[2,17]),o($Vl,[2,19]),o($Vl,[2,20]),{23:73,24:74,25:$Vm},o($Vl,[2,34]),{25:[2,27]},{25:[2,28]},o($Vl,[2,35]),o($Vn,$Vo,{25:$Vp,32:$Vq}),{25:$Vr,34:77},o($Vl,[2,36]),o($Vl,[2,37]),o($Vl,[2,38]),o($Vl,[2,39]),o($Vl,[2,40],{33:[1,79],35:[1,80],45:[1,81],46:[1,82]}),o($Vs,[2,41]),o($Vs,[2,46],{49:[1,83],50:[1,84]}),o($Vt,[2,47],{52:$Vu,53:$Vv}),o($Vw,[2,50]),o($Vw,[2,53]),o($Vw,[2,54]),o($Vw,[2,55],{60:[1,87]}),{25:$Vx,26:54,50:$V3,55:88,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{25:$Vx,26:54,50:$V3,55:90,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},o($Vy,[2,59],{26:91,57:$Vz,62:$VA,64:$VB,76:$Vf}),o([25,50,57,62,65,66,67,68,76],[2,58]),o($Vn,[2,61]),o($Vn,[2,68]),o($Vn,[2,69]),o($Vn,[2,70]),{15:95,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{15:96,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},o($Vn,[2,73]),{15:97,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{1:[2,3]},o($Vj,[2,7]),{22:99,25:$VC,30:27,31:28,33:$V2,36:98},o($Vj,[2,14]),{15:101,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{9:102,14:$V0,15:15,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{15:103,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},o($Vj,[2,78]),o($Vj,[2,76]),{73:[1,104]},{15:105,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{18:106,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},o($VD,[2,84]),o($VD,[2,85]),o($VD,[2,86]),o($VD,[2,87]),o($VD,[2,88]),o($Vl,[2,21]),o($Vl,[2,22]),o($Vl,[2,23],{26:107,27:108,76:[1,109]}),{25:[2,30]},{35:[1,110]},{35:[2,80],64:[1,111]},{25:$Vx,26:54,44:112,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{25:$Vx,26:54,44:113,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{25:$Vx,26:54,44:114,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{25:$Vx,26:54,44:115,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{25:$Vx,26:54,48:116,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{25:$Vx,26:54,48:117,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{25:$Vx,26:54,50:$V3,51:118,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{25:$Vx,26:54,50:$V3,51:119,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{25:$Vx,26:54,59:120,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},o($Vw,[2,56]),o($Vn,$Vo),o($Vw,[2,57]),o($Vn,[2,62]),{15:121,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,63:[1,122],65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{25:[1,123]},o($Vn,[2,66]),{69:[1,124]},{63:[1,125]},{77:[1,126]},{25:[1,127]},{25:[2,33]},{25:$Vp,32:$Vq},{63:[1,128]},{9:129,14:$V0,15:15,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{63:[1,130]},o($Vj,[2,77]),o($Vk,[2,16]),o($Vl,[2,18]),o($Vl,[2,24]),o($Vl,[2,25]),{15:97,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf,77:[1,131]},{25:[2,31],32:[1,132]},{25:$Vr,34:133},o($Vs,[2,42]),o($Vs,[2,43]),o($Vs,[2,44]),o($Vs,[2,45]),o($Vt,[2,48],{52:$Vu,53:$Vv}),o($Vt,[2,49],{52:$Vu,53:$Vv}),o($Vw,[2,51]),o($Vw,[2,52]),o($Vy,[2,60],{26:91,57:$Vz,62:$VA,64:$VB,76:$Vf}),{63:[1,134]},o($Vn,[2,64]),o($Vn,[2,65]),o($Vn,[2,71]),o($Vn,[2,72]),o($Vn,[2,82]),{62:[1,135]},{8:136,9:8,10:9,11:10,12:11,13:12,14:$V0,15:15,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,70:$Va,71:$Vb,72:$Vc,74:$Vd,75:$Ve,76:$Vf},{15:137,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,76:$Vf},{8:138,9:8,10:9,11:10,12:11,13:12,14:$V0,15:15,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,70:$Va,71:$Vb,72:$Vc,74:$Vd,75:$Ve,76:$Vf},o($Vl,[2,83]),{25:[2,32]},{35:[2,81]},o($Vn,[2,63]),{22:141,25:$VC,30:27,31:28,33:$V2,63:[1,140],85:139},o($Vj,[2,74]),{63:[1,142]},o($Vj,[2,79]),{63:[1,143]},{13:144,72:$Vc},{24:145,25:$Vm},{8:146,9:8,10:9,11:10,12:11,13:12,14:$V0,15:15,16:21,18:22,20:23,21:24,22:25,25:$V1,26:54,30:27,31:28,33:$V2,37:26,38:29,39:32,40:33,41:34,42:35,43:36,44:37,47:38,48:39,50:$V3,51:40,54:41,55:42,56:43,57:$V4,58:45,59:46,61:48,62:$V5,65:$V6,66:$V7,67:$V8,68:$V9,70:$Va,71:$Vb,72:$Vc,74:$Vd,75:$Ve,76:$Vf},{13:147,72:$Vc},o($Vh,[2,90]),{17:[1,148],63:[2,91]},o($Vj,[2,75]),o($Vh,[2,89]),{22:141,25:$VC,30:27,31:28,33:$V2,85:149},{63:[2,92]}],
defaultActions: {2:[2,1],27:[2,27],28:[2,28],56:[2,3],76:[2,30],99:[2,33],132:[2,32],133:[2,81],149:[2,92]},
parseError: function parseError(str, hash) {
    if (hash.recoverable) {
        this.trace(str);
    } else {
        throw new Error(str);
    }
},
parse: function parse(input) {
    var self = this, stack = [0], tstack = [], vstack = [null], lstack = [], table = this.table, yytext = '', yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    var args = lstack.slice.call(arguments, 1);
    var lexer = Object.create(this.lexer);
    var sharedState = { yy: {} };
    for (var k in this.yy) {
        if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
            sharedState.yy[k] = this.yy[k];
        }
    }
    lexer.setInput(input, sharedState.yy);
    sharedState.yy.lexer = lexer;
    sharedState.yy.parser = this;
    if (typeof lexer.yylloc == 'undefined') {
        lexer.yylloc = {};
    }
    var yyloc = lexer.yylloc;
    lstack.push(yyloc);
    var ranges = lexer.options && lexer.options.ranges;
    if (typeof sharedState.yy.parseError === 'function') {
        this.parseError = sharedState.yy.parseError;
    } else {
        this.parseError = Object.getPrototypeOf(this).parseError;
    }
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    _token_stack:
        function lex() {
            var token;
            token = lexer.lex() || EOF;
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }
            return token;
        }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == 'undefined') {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
                    if (typeof action === 'undefined' || !action.length || !action[0]) {
                var errStr = '';
                expected = [];
                for (p in table[state]) {
                    if (this.terminals_[p] && p > TERROR) {
                        expected.push('\'' + this.terminals_[p] + '\'');
                    }
                }
                if (lexer.showPosition) {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ', got \'' + (this.terminals_[symbol] || symbol) + '\'';
                } else {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
                }
                this.parseError(errStr, {
                    text: lexer.match,
                    token: this.terminals_[symbol] || symbol,
                    line: lexer.yylineno,
                    loc: yyloc,
                    expected: expected
                });
            }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(lexer.yytext);
            lstack.push(lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = lexer.yyleng;
                yytext = lexer.yytext;
                yylineno = lexer.yylineno;
                yyloc = lexer.yylloc;
                if (recovering > 0) {
                    recovering--;
                }
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {
                first_line: lstack[lstack.length - (len || 1)].first_line,
                last_line: lstack[lstack.length - 1].last_line,
                first_column: lstack[lstack.length - (len || 1)].first_column,
                last_column: lstack[lstack.length - 1].last_column
            };
            if (ranges) {
                yyval._$.range = [
                    lstack[lstack.length - (len || 1)].range[0],
                    lstack[lstack.length - 1].range[1]
                ];
            }
            r = this.performAction.apply(yyval, [
                yytext,
                yyleng,
                yylineno,
                sharedState.yy,
                action[1],
                vstack,
                lstack
            ].concat(args));
            if (typeof r !== 'undefined') {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}};

function Parser () {
  this.yy = {};
}
Parser.prototype = parser;parser.Parser = Parser;
return new Parser;
})();


if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = parser;
exports.Parser = parser.Parser;
exports.parse = function () { return parser.parse.apply(parser, arguments); };
exports.main = function commonjsMain(args) {
    if (!args[1]) {
        console.log('Usage: '+args[0]+' FILE');
        process.exit(1);
    }
    var source = require('fs').readFileSync(require('path').normalize(args[1]), "utf8");
    return exports.parser.parse(source);
};
if (typeof module !== 'undefined' && require.main === module) {
  exports.main(process.argv.slice(1));
}
}
window.ChuckParser = parser.Parser;

define("chuck/parser", function(){});

