const St             = imports.gi.St;
const Soup           = imports.gi.Soup;
const Main           = imports.ui.main;
const Lang           = imports.lang;
const PanelMenu      = imports.ui.panelMenu;
const Mainloop       = imports.mainloop;
const Clutter        = imports.gi.Clutter;
const Gio            = imports.gi.Gio;
const GLib           = imports.gi.GLib;
const Me             = imports.misc.extensionUtils.getCurrentExtension();
const PopupMenu      = imports.ui.popupMenu;

const EXTENSION_NAME = 'Covid19Tracker';
const CACHE_SCHEMA = 'org.gnome.shell.extensions.covid19tracker.cache';
const COL_ORDER = ['countryCode', 'country', 'cases', 'deaths', 'recovered', 'active', 'critical', 'confirmed', 'timestamp', 'todayCases', 'todayDeaths', 'casesPerOneMillion', 'deathsPerOneMillion'];
const FLAG_WIDTH = 23, FLAG_HEIGHT = 13;
const URL = 'https://corona-stats.online/';
const DIAMOND_PRINCESS_CC = 'DP';
const WORLD_CC = 'WRL';

/**
 * Returns an array with indices indicating the order
 * of the array ordered by the specified valueName
 */
function objArrayOrderStr(objarray, valueName) {
	let indices = [...Array(objarray.length).keys()];
	let order = indices.sort(function(i1, i2) {
		if (objarray[i1][valueName] < objarray[i2][valueName]){
			return -1;
		} else {
			return +(objarray[i1][valueName] > objarray[i2][valueName]);
		}
	});
	
	return order;
}

/**
 * Returns a reduced string representation of a number
 */
function reduceNum(num){
	let suffix = '';
	
	while (num >= 1000) {
		num = num/1000;
		suffix += 'K';
	}
	
	if (!Number.isInteger(num)) {
		num = num.toFixed(1);
	}
	
	return `${num}${suffix}`;
}

/**
 * Logs msg with personalized format for easy finding
 */
function myLog(msg) {
	let nowStr = GLib.DateTime.new_now_local().format('%Y-%m-%d %H:%M:%S');
	log(`[COVID19T ${nowStr}]: ${msg}`);
}

function findFlagFile(flagFiles, countryCode) {
	let fileName, found = '';
	
	for (fileName of flagFiles) {
		if (countryCode.toLowerCase() == fileName.split('.')[0].toLowerCase()) {
			found = fileName;
		}
	}
	
	return found;
}

const Covid19Tracker = new Lang.Class({
	Name: EXTENSION_NAME,
	Extends: PanelMenu.Button,
	
	/**
	 * Initialize base extension values
	 */
	_init: function() {
		this.parent(0.0, 'covid19tracker', false); // idk what this does, I think its the parent's init
		
		// Load schema
		this.cacheSchema = this.getCacheSchema();
		// Read and process cache
		let rawCache = this.cacheSchema.get_value('cache').deep_unpack();
		this.cache = this.transformRawCache(rawCache);
		// Read country config
		this.selectedCountry = this.cacheSchema.get_string('selected-country');
		// Rea dupdate frequency
		this.updateFrequency = this.cacheSchema.get_int('update-frequency');
		
		// Reference to the session object so that we can stop it if neccesary
		this.httpSession = new Soup.Session();
		
		// Extension's layout
		this.mainLayout = new St.BoxLayout();
		this.actor.add_actor(this.mainLayout);
		
		// Flag icon
		//let iconSize = new Clutter.Size({width: FLAG_WIDTH, height: FLAG_HEIGHT});
		this.flagIcon = new St.Icon({style_class: 'flag-icon'});
		this.mainLayout.add(this.flagIcon);
		
		// Stats text
		this.statsText = new St.Label({
			text: '...',
			y_align: Clutter.ActorAlign.CENTER,
			style_class: 'covid-text'
		});
		this.mainLayout.add(this.statsText);
		
		// Menu
		// World data
		this.menu.addAction(
			'World',
			this.selectCountry.bind(this, WORLD_CC),
			null
		);
		// Diamond Princess
		this.menu.addAction(
			'Diamond Princess',
			this.selectCountry.bind(this, DIAMOND_PRINCESS_CC),
			null
		);
		// Country selector
		this.countrySelector = new PopupMenu.PopupSubMenuMenuItem('Countries');
		this.countrySelector.menu.box.style_class = 'country-menu-item';
		this.menu.addMenuItem(this.countrySelector);
		this.updateCountrySelectorUi();
		
		// Draw UI
		this.selectCountry(this.selectedCountry);
		myLog('Start successful');
		
		this.updateCache(); // This starts the main loop
	},
	
	/**
	 * Returns main (cache) schema's settings object 
	 */
	getCacheSchema: function() {
		let schemaSource = Gio.SettingsSchemaSource.new_from_directory(
			Me.dir.get_child('schemas').get_path(),
			Gio.SettingsSchemaSource.get_default(),
			false
		);
		let schemaObj = schemaSource.lookup(CACHE_SCHEMA, true);
		if (!schemaObj) {
			throw new Error('Could not find specified schema "' + CACHE_SCHEMA + '"');
		}
		
		return new Gio.Settings({settings_schema: schemaObj});
	},
	
	/**
	 * Transforms the rawCache matrix into a a friendlier array of dicts.
	 * 
	 * The rawCache matrix's cols are arranged as in COL_ORDER
	 * 
	 */
	transformRawCache: function(rawCache) {
		let cache = [];
		let row, cacheRow;
		for(row of rawCache) {
			cacheRow = new Object();
			for (const [i, colName] of COL_ORDER.entries()) {
				cacheRow[colName] = row[i];
			}
			cache.push(cacheRow);
		}
		
		return cache;
	},
	
	/**
	 * Returns the rawCache representation of the friendly cache array
	 */
	getRawCache: function() {
		let rawCache = [];
		
		let row, rawCacheRow;
		for (row of this.cache) {
			rawCacheRow = [];
			for(let colName of COL_ORDER) {
				rawCacheRow.push(row[colName]);
			}
			rawCacheRow.push(row['flagUrl']);
			rawCache.push(rawCacheRow);
		}
		
		return rawCache;
	},
	
	/**
	 * Updates the values displayed in the UI
	 */
	updateUi: function(){
		let idx = this.getCountryIndex(this.selectedCountry);
		if (idx < 0) {
			this.statsText.set_text('No data');
			return;
		}
		let country = this.cache[idx];
		
		// Flag
		let cachedFlags = this.getCachedFlags();
		let flagFileName = findFlagFile(cachedFlags, country.countryCode)
		if ( flagFileName == ''){
			// Download it
			let msg = Soup.Message.new_from_uri("GET", new Soup.URI(country.flagUrl))
			this.httpSession.queue_message(msg, Lang.bind(this, function(session, response) {
				if (response.status_code != 200){
					return;
				}
				let flagFileNameTokens = country.flagUrl.split('/');
				flagFileName = flagFileNameTokens[flagFileNameTokens.length - 1];
				let flagFilePath = Me.dir.get_child('icons').get_child(flagFileName).get_path();
				let flagFile = Gio.File.new_for_path(flagFilePath)
				let outstream = flagFile.replace(null, false, Gio.FileCreateFlags.NONE, null);
				outstream.write_bytes(
					response.response_body.flatten().get_as_bytes(),
					null
				)
				this.updateUi();
			}));
		} else {
			let flagPath = Me.dir.get_child('icons').get_child(flagFileName).get_path();
			let gicon = Gio.icon_new_for_string(flagPath);
			this.flagIcon.set_gicon(gicon);
		}
		
		// Stats
		let confirmedStr = reduceNum(country.confirmed);
		let deathsStr = reduceNum(country.deaths);
		let txt = `CV19 😷: ${confirmedStr}  💀: ${deathsStr}`;
		
		this.statsText.set_text(txt);
	},
	
	/**
	 * Stores the country selection and updates the UI
	 */
	selectCountry: function(countryCode) {
		this.selectedCountry = countryCode;
		this.updateUi();
	},
	
	/**
	 * Updates the list of countries displayed by the UI
	 */
	updateCountrySelectorUi: function() {
		let order = objArrayOrderStr(this.cache, 'country');
		
		this.countrySelector.menu.removeAll();
		
		for(let i of order) {
			if ([DIAMOND_PRINCESS_CC, WORLD_CC].includes(this.cache[i].countryCode) ){
				continue;
			}
			this.countrySelector.menu.addAction(
				this.cache[i].country,
				this.selectCountry.bind(this, this.cache[i].countryCode),
				null
			)
		}
	},
	
	/**
	 * Singlas the UI that last cache update failed
	 */
	signalCacheUpdateFail: function(){
		
	},
	
	/**
	 * Returns index of the request country in the cache
	 */
	getCountryIndex: function(countryCode) {
		let idx = -1
		for (const [i, row] of this.cache.entries()) {
			if (row.countryCode == countryCode) {
				idx = i;
				break;
			}
		}
		
		return idx;
	},
	
	/**
	 * Updates the specified row in the cache
	 */
	updateCacheRow: function(row) {
		let idx = this.getCountryIndex(row.countryCode);
		
		// If we have it update it, else just add it
		if (idx >= 0 ) {
			this.cache[idx] = row;
		} else {
			this.cache.push(row);
		}
	},
	
	getCachedFlags: function() {
		let cachedFlagsEnumerator = Me
			.dir.get_child('icons')
			.enumerate_children(
				'name', Gio.FileQueryInfoFlags.NONE, null);
				
		let flagFileInfo, flagFileName, cachedFlags = []
		
		while (flagFileInfo = cachedFlagsEnumerator.next_file(null)) {
			flagFileName = flagFileInfo.get_name();
			cachedFlags.push(flagFileName);
		}
		
		return cachedFlags;
	},
	
	/**
	 * Calls the API, updates the information stored in cache and
	 * updates the UI
	 */
	updateCache: function() {
		myLog('Updating cache...');
		
		let params = {
			format: 'json',
			source: '2'
		}
		
		// Declare async request with callback
		let msg = Soup.form_request_new_from_hash('GET', URL, params);
		this.httpSession.queue_message(msg, Lang.bind(this, function(session, response) {
			if (response.status_code != 200) {
				this.signalCacheUpdateFail();
				return;
			}
			let timestamp = GLib.DateTime.new_now_local().format('%Y-%m-%d_%H:%M:%S');
			let json = JSON.parse(response.response_body.data);
			
			// Countries
			let updatedRow, colName, countryCode, row;
			for(row of json.data) {
				// Search countryCode
				countryCode = undefined;
				countryCode = row.countryCode || row.countryInfo.iso2 || row.countryInfo.iso3;
				// Special case that has no countryCode
				if (row.country == 'Diamond Princess'){
					countryCode = DIAMOND_PRINCESS_CC;
				}
				if (!countryCode){
					continue;
				}
				
				// Generate updated row
				updatedRow = new Object();
				for(colName of COL_ORDER) {
					updatedRow[colName] = row[colName] || -1;
				}
				updatedRow.timestamp = timestamp;
				updatedRow.countryCode = countryCode;
				updatedRow.flagUrl = row.countryInfo.flag;
				this.updateCacheRow(updatedRow);
			}
			// World data
			updatedRow = new Object();
			for(colName of COL_ORDER) {
				updatedRow[colName] = json.worldStats[colName];
			}
			updatedRow.timestamp = timestamp;
			updatedRow.countryCode = WORLD_CC;
			updatedRow.flagUrl = '';
			this.updateCacheRow(updatedRow);
			
			this.updateCountrySelectorUi();
			this.updateUi();
		}));
		
		// Refresh timeout
		if (this.timeout) {
			Mainloop.source_remove(this.timeout);
			this.timeout = null;
		}
		this.timeout = Mainloop.timeout_add_seconds(this.updateFrequency, Lang.bind(this, this.updateCache));
		
		return true;
	},
	
	/**
	 * Removes all neccesary parts of the extension and stops all the
	 * processes that were initialized
	 */
	stop: function() {
		if(this.timeout) {
			Mainloop.source_remove(this.timeout);
		}
		this.timeout = undefined;
		
		if (this.httpSession != undefined) {
			this.httpSession.abort();
		}
		this.httpSession = undefined;
		
		this.cacheSchema.set_value(
			'cache',
			new GLib.Variant('a(ssiiiiiisiidds)', this.getRawCache())
		);
		
		this.cacheSchema.set_string('selected-country', this.selectedCountry);
		
		this.menu.removeAll();
	}
});

let covid19Tracker;

function init() {
}

function enable() {
	covid19Tracker = new Covid19Tracker();
	Main.panel.addToStatusArea('covid19tracker', covid19Tracker);
	myLog('Enabled');
}

function disable() {
	covid19Tracker.stop();
	covid19Tracker.destroy();
	myLog('Disabled');
}
