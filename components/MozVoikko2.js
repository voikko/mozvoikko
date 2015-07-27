/* ***** BEGIN LICENSE BLOCK *****
 *
 *   This file is part of mozvoikko2.
 *
 *   mozvoikko2 is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 2 of the License, or
 *   (at your option) any later version.
 *
 *   mozvoikko is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
 *
 * ***** END OF LICENSE BLOCK ***** */
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/ctypes.jsm");

const mozISpellCheckingEngine = Components.interfaces.mozISpellCheckingEngine;
const CLASS_ID = Components.ID("89630d4c-c64d-11e0-83d8-00508d9f364f");
const CLASS_NAME = "Spell checker based on Voikko";
const CONTRACT_ID = "@mozilla.org/mozvoikko2;1";

const VOIKKO_OPT_IGNORE_DOT = 0;
const VOIKKO_OPT_IGNORE_NUMBERS = 1;
const VOIKKO_OPT_IGNORE_UPPERCASE = 3;
const VOIKKO_OPT_ACCEPT_MISSING_HYPHENS = 12;

const OPTIONAL_DEPENDENCIES = {
    "WINNT_x86-msvc" : ["libgcc_s_sjlj-1.dll", "libstdc++-6.dll", "zlib1.dll", "libarchive-13.dll", "libhfstospell-4.dll"],
    "Darwin_x86_64-gcc3" : ["libtinyxml2.3.dylib", "libarchive.13.dylib", "libhfstospell.4.dylib"],
    "Darwin_x86-gcc3" : ["libtinyxml2.3.dylib", "libarchive.13.dylib", "libhfstospell.4.dylib"]
};

function tryLoadLibrary(abi, lib_name) {
    // Try to locate the library inside extension directory and
    // replace value
    var extension_dir = __LOCATION__.parent.parent;
    var library_loc = extension_dir.clone();
    library_loc.append("voikko");
    library_loc.append(abi);
    library_loc.append(lib_name);
    if (library_loc.exists() && library_loc.isFile())
    {
        var handle = ctypes.open(library_loc.path);
        aConsoleService.logStringMessage("MozVoikko2: loaded bundled library " + library_loc.path);
        return handle;
    }
    else
    {
        var handle = ctypes.open(lib_name);
        aConsoleService.logStringMessage("MozVoikko2: loaded system library " + library_loc.path);
        return handle;
    }
}

function LibVoikko()
{
}

LibVoikko.prototype = {
    libvoikko: null,
    optional_deps: [],

    data_loc: "",

    call_abi: ctypes.default_abi,

    fn_voikko_init: null,
    fn_voikko_terminate: null,
    fn_voikko_spell_cstr: null,
    fn_voikko_suggest_cstr: null,
    fn_voikko_free_cstr_array: null,
    fn_voikko_set_boolean_option: null,
    fn_voikkoListSupportedSpellingLanguages: null,

    init : function()
    {
        var runtime = Components.classes["@mozilla.org/xre/app-info;1"]
            .getService(Components.interfaces.nsIXULRuntime);

        var abi = runtime.OS + "_" + runtime.XPCOMABI;

        var lib_name;
        this.data_loc = "";
        //==================================================================
        // Detect shared library name to load
        //==================================================================
        if (abi.indexOf("Linux_") == 0)
        {
            lib_name = "libvoikko.so.1";
        }
        else if (abi == "WINNT_x86-msvc" || abi == "WINNT_x86_64-msvc")
        {
            lib_name = "libvoikko-1.dll";
            this.call_abi = ctypes.winapi_abi;
        }
        else if (abi == "Darwin_x86_64-gcc3" || abi == "Darwin_x86-gcc3" || abi == "Darwin_ppc-gcc3")
        {
            lib_name = "libvoikko.1.dylib";
        }
        else
        {
            throw "Unsupported ABI " + abi;
        }

        try {
            this.libvoikko = tryLoadLibrary(abi, lib_name);
        }
        catch (err) {
            aConsoleService.logStringMessage("MozVoikko2: Failed to load libvoikko (" + lib_name + "), maybe we need optional dependencies");
            if (abi in OPTIONAL_DEPENDENCIES) {
                for (var i = 0; i < OPTIONAL_DEPENDENCIES[abi].length; i++) {
                    var dep = OPTIONAL_DEPENDENCIES[abi][i];
                    try {
                        var h = tryLoadLibrary(abi, dep);
                        this.optional_deps.push(h);
                    }
                    catch (e2) {
                        aConsoleService.logStringMessage("MozVoikko2: Failed to load optional dependency " + dep);
                    }
                }
                this.libvoikko = tryLoadLibrary(abi, lib_name);
            }
            else {
                throw err;
            }
        }

        var data_loc = __LOCATION__.parent.parent.clone();
        data_loc.append("voikko");
        this.data_loc = data_loc.path;

        /* Detect used libvoikko version and output a message to Javascript console. */
        var fn_voikkoGetVersion = this.libvoikko.declare(
            "voikkoGetVersion",
            this.call_abi,
            ctypes.char.ptr);

        var version_str = fn_voikkoGetVersion().readString();
        aConsoleService.logStringMessage("MozVoikko2: Using libvoikko version " + version_str);


        //
        // struct VoikkoHandle * voikkoInit(const char ** error, const char * langcode,
        //                                  const char * path);
        //
        this.fn_voikko_init = this.libvoikko.declare(
            "voikkoInit",
            this.call_abi,
            ctypes.voidptr_t, // Return value: we are not interested what is inside
            ctypes.char.ptr.ptr,
            ctypes.char.ptr,
            ctypes.char.ptr);

        //
        // void voikkoTerminate(struct VoikkoHandle * handle);
        //
        this.fn_voikko_terminate = this.libvoikko.declare(
            "voikkoTerminate",
            this.call_abi,
            ctypes.void_t,
            ctypes.voidptr_t);
        
        //
        // int voikkoSpellCstr(struct VoikkoHandle * handle, const char * word);
        //
        this.fn_voikko_spell_cstr = this.libvoikko.declare(
            "voikkoSpellCstr",
            this.call_abi,
            ctypes.int,
            ctypes.voidptr_t,
            ctypes.char.ptr);

        //
        // char ** voikkoSuggestCstr(struct VoikkoHandle * handle, const char * word);
        //
        this.fn_voikko_suggest_cstr = this.libvoikko.declare(
            "voikkoSuggestCstr",
            this.call_abi,
            ctypes.char.ptr.array(50).ptr,
            ctypes.voidptr_t,
            ctypes.char.ptr);

        //
        // void voikkoFreeCstrArray(char ** cstrArray);
        //
        this.fn_voikko_free_cstr_array = this.libvoikko.declare(
            "voikkoFreeCstrArray",
            this.call_abi,
            ctypes.void_t,
            ctypes.char.ptr.array(50).ptr);

        //
        // int voikkoSetBooleanOption(struct VoikkoHandle * handle, int option, int value);
        //
        this.fn_voikko_set_boolean_option = this.libvoikko.declare(
            "voikkoSetBooleanOption",
            this.call_abi,
            ctypes.int,
            ctypes.voidptr_t,
            ctypes.int,
            ctypes.int);

        //
        // char ** voikkoListSupportedSpellingLanguages(const char * path)
        //
        this.fn_voikkoListSupportedSpellingLanguages = this.libvoikko.declare(
            "voikkoListSupportedSpellingLanguages",
            this.call_abi,
            ctypes.char.ptr.array(50).ptr,
            ctypes.char.ptr);

    },

    finalize : function()
    {
        this.fn_voikko_init = null;
        this.fn_voikko_terminate = null;
        this.libvoikko.close();
        while (this.optional_deps.length > 0) {
            this.optional_deps.pop().close();
        }
    }
};

var aConsoleService = Components.classes["@mozilla.org/consoleservice;1"].
    getService(Components.interfaces.nsIConsoleService);


try
{
    var libvoikko = new LibVoikko;
    libvoikko.init();
}
catch (err)
{
    Components.utils.reportError(err);
    throw err;
}

function VoikkoHandle(libvoikko)
{
}


VoikkoHandle.prototype = {
    handle: null,
    libvoikko: null,

    open : function(libvoikko, lang_code)
    {
        var message = ctypes.char.ptr(null);
        var message_ptr = message.address();
        var data_loc = null;

        if (libvoikko.data_loc != "")
        {
            data_loc = libvoikko.data_loc;
        }

        this.libvoikko = libvoikko;

        this.handle = this.libvoikko.fn_voikko_init(
            message_ptr,
            lang_code,
            data_loc);

        this.libvoikko.fn_voikko_set_boolean_option(this.handle, VOIKKO_OPT_IGNORE_DOT, 1);
        this.libvoikko.fn_voikko_set_boolean_option(this.handle, VOIKKO_OPT_IGNORE_NUMBERS, 1);
        this.libvoikko.fn_voikko_set_boolean_option(this.handle, VOIKKO_OPT_IGNORE_UPPERCASE, 1);
        this.libvoikko.fn_voikko_set_boolean_option(this.handle, VOIKKO_OPT_ACCEPT_MISSING_HYPHENS, 1);
    },

    finalize : function()
    {
        if (this.handle)
        {
            this.libvoikko.fn_voikko_terminate(this.handle);
            this.handle = null;
        }
    }
};


function MozVoikko2()
{
}

MozVoikko2.prototype = {
    classDescription: CLASS_NAME,
    classID: CLASS_ID,
    contractID: CONTRACT_ID,

    voikko_handle : null,
    supportedDicts : null,
    currentDict: null,
    mPersonalDictionary : null,

    QueryInterface: XPCOMUtils.generateQI([mozISpellCheckingEngine, Components.interfaces.nsISupport]),

    get dictionary()
    {
        return this.currentDict;
    },

    set dictionary(dict)
    {
        if (dict == this.currentDict)
        {
            return;
        }
        var availableDict = this.getSupportedDictionaryCodeInternal(dict);
        if (availableDict == null)
        {
            throw "mozvoikko2: dictionary '" + dict + "' is not supported by this component (but may be supported by others)";
        }
        try
        {
            if (this.voikko_handle)
            {
                this.voikko_handle.finalize();
            }
            this.voikko_handle = new VoikkoHandle;
            this.voikko_handle.open(libvoikko, availableDict);
            this.currentDict = dict;
        }
        catch (err)
        {
            Components.utils.reportError(err);
            throw err;
        }
    },

    get providesPersonalDictionary()
    {
        return false;
    },

    get providesWordUtils()
    {
        return false;
    },

    get name()
    {
        return "MozVoikko 2";
    },

    get copyright()
    {
        return "GPL v2";
    },

    get personalDictionary()
    {
        return this.mPersonalDictionary;
    },

    set personalDictionary(mPersonalDictionary)
    {
        this.mPersonalDictionary = mPersonalDictionary;
    },

    getSupportedDictionariesInternal : function()
    {
        if (this.supportedDicts == null) {
            var data_loc = null;
            if (libvoikko.data_loc) {
                data_loc = libvoikko.data_loc;
            }
            var cSpellingLangs = libvoikko.fn_voikkoListSupportedSpellingLanguages(data_loc);
            if (!cSpellingLangs.isNull())
            {
                var spellingLangs = [];
                for (i = 0; i < 200 && !cSpellingLangs.contents[i].isNull(); i++)
                {
                    spellingLangs.push(cSpellingLangs.contents[i].readString());
                }
                libvoikko.fn_voikko_free_cstr_array(cSpellingLangs);
                this.supportedDicts = spellingLangs;
            }
        }
    },

    getSupportedDictionaryCodeInternal : function(dict)
    {
        this.getSupportedDictionariesInternal();
        if (this.supportedDicts == null)
        {
            return;
        }
        if (this.supportedDicts.indexOf(dict) != -1)
        {
            return dict;
        }
        if (dict.indexOf("_") > -1)
        {
            var d = dict.substr(0, dict.indexOf("_"));
            if (this.supportedDicts.indexOf(d) != -1)
            {
                return d;
            }
        }
    },

    getDictionaryList : function(dicts, count)
    {
        this.getSupportedDictionariesInternal();
        dicts.value = this.supportedDicts;
        count.value = this.supportedDicts.length;
    },

    check : function(word)
    {
        if (word.length < 2)
        {
            return true;
        }
        var result = libvoikko.fn_voikko_spell_cstr(this.voikko_handle.handle, word);

        if (result == 0 && this.mPersonalDictionary)
        {
            return this.mPersonalDictionary.check(word, this.currentDict);
        }
        else
        {
            return result != 0;
        }
    },

    suggest : function(word, sugg, count)
    {
        var i;
        var tmp = libvoikko.fn_voikko_suggest_cstr(this.voikko_handle.handle, word);

        count.value = 0;

        if (!tmp.isNull())
        {
            sugg.value = [];
            count.value = 0;

            for (i = 0; i < 50 && !tmp.contents[i].isNull(); i++)
            {
                sugg.value[i] = tmp.contents[i].readString();
                count.value ++;
            }
        }

        libvoikko.fn_voikko_free_cstr_array(tmp);
    }   
}


if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([MozVoikko2]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([MozVoikko2]);
