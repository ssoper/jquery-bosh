require 'test/unit'
require 'webrick'
require 'thread'

class ::WEBrick::HTTPServer
  def access_log(config, req, res)
    # nop
  end
end

class ::WEBrick::BasicLog
  def log(level, data)
    # nop
  end
end

class BoshService < ::WEBrick::HTTPServlet::AbstractServlet
  def do_POST(req, res)
    res.status = 200
    res.body = %Q(<body xmlns="http://jabber.org/protocol/httpbind"/>)
    res['Content-Type'] = "text/xml"
  end
end

port = 5280
path = "/http-bind/"
server = WEBrick::HTTPServer.new( :Port => port, :ServerType => WEBrick::Daemon )
server.mount(path, BoshService)

trap("INT") {
  server.shutdown
  exit
}

puts "=> Webrick started on http://localhost#{path}:#{port}"

server.start


# class ListClient  < Test::Unit::TestCase
# 
#   def setup
#     # create the server
#     @server = WEBrick::HTTPServer.new( :Port => 5280 )
# 
#     # setup test server (simulates exact target)
#     @server.mount("/http-bind/", BoshService)
# 
#     # start up the server in a background thread
#     @thread = Thread.new(@server) do|server|
#       server.start
#     end
#   end
# 
#   def teardown
#     @server.shutdown
#     #@thread.join
#   end
# 
# end

# class ETService
#   include ET::Renderable
#   def initialize
#     set_template_path( File.join(File.dirname(__FILE__), "templates") )
#   end
# end
# 
# class DiagnosticsService < ETService
#   def ping(params)
#     render_template("diagnostics_ping_success")
#   end
# end
# 
# class ListService < ETService
#   def add(params)
#     list_type = params['list_type']
#     if list_type != 'private' and list_type != 'public'
#       render_template("list_add_failure")
#     else
#       render_template("list_add_success")
#     end
#   end
# 
#   def retrieve(params)
#     render_template("list_retrieve_all_success")
#   end
# end
# 
# class SubscriberService < ETService
# 
#   def retrieve(params)
#     if params['search_value2']
#       @email = params['search_value2']
#       render_template("subscriber_retrieve_success")
#     else
#       render_template("subscriber_retrieve_failed")
#     end
#   end
# 
#   def edit(params)
#     if params['search_value2']
#       @email = params['search_value2']
#       render_template("subscriber_edit_success")
#     else
#       render_template("subscriber_edit_failed")
#     end
#   end
# 
# end
# 
# 
# 
# class SubscriberETService < ::WEBrick::HTTPServlet::AbstractServlet
# 
#   def do_POST(req, res)
# 
#     xml_body = String.new(req.body)
#     xml_body.gsub!(/qf=xml&xml=/,'')
#     doc = Hpricot.XML(xml_body)
#     system = doc.at(:system)
#     system_name = system.at(:system_name).inner_html.strip.downcase
#     action = system.at(:action).inner_html.strip.downcase
# 
#     params = {}
#     # load all the system parameters into a hash
#     system.each_child do|element|
#       next unless element.elem?
#       params[element.name] = element.inner_html.strip
#     end
# 
#     response = service_for(system_name).send(action, params)
# 
#     res.body = %Q(<?xml version="1.0" ?>
# <exacttarget>
# #{response}
# </exacttarget>)
# 
#     res['Content-Type'] = "text/xml"
#   end
# 
# private
#   def service_for(system_name)
#     eval("#{system_name.capitalize}Service.new")  #render_template("#{system_name}_#{action}_success")
#   end
# 
# end
# 
# module ET
#   module TestCase
# 
#     def setup
#       # create the server
#       @server = WEBrick::HTTPServer.new( :Port => 5280 )
# 
#       # setup test server (simulates exact target)
#       @server.mount("/http-bind/", BoshService)
#  
#       # start up the server in a background thread
#       @thread = Thread.new(@server) do|server|
#         server.start
#       end
#     end
# 
#     def teardown
#       @server.shutdown
#       #@thread.join
#     end
# 
#   end
# end
