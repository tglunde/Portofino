/*
 * Copyright (C) 2005-2017 ManyDesigns srl.  All rights reserved.
 * http://www.manydesigns.com/
 *
 * This is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation; either version 3 of
 * the License, or (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this software; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

package com.manydesigns.portofino.pageactions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.manydesigns.elements.ElementsThreadLocals;
import com.manydesigns.elements.forms.Form;
import com.manydesigns.elements.messages.RequestMessages;
import com.manydesigns.elements.messages.SessionMessages;
import com.manydesigns.elements.reflection.JavaClassAccessor;
import com.manydesigns.elements.util.MimeTypes;
import com.manydesigns.elements.util.ReflectionUtil;
import com.manydesigns.portofino.buttons.GuardType;
import com.manydesigns.portofino.code.CodeBase;
import com.manydesigns.portofino.dispatcher.AbstractResourceWithParameters;
import com.manydesigns.portofino.dispatcher.Resource;
import com.manydesigns.portofino.operations.Operation;
import com.manydesigns.portofino.operations.Operations;
import com.manydesigns.portofino.pageactions.registry.ActionRegistry;
import com.manydesigns.portofino.pages.Group;
import com.manydesigns.portofino.pages.Page;
import com.manydesigns.portofino.pages.PageLogic;
import com.manydesigns.portofino.pages.Permissions;
import com.manydesigns.portofino.security.*;
import com.manydesigns.portofino.shiro.ShiroUtils;
import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiResponse;
import io.swagger.annotations.ApiResponses;
import org.apache.commons.configuration.Configuration;
import org.apache.commons.vfs2.FileObject;
import org.apache.commons.vfs2.FileSystemException;
import org.apache.shiro.SecurityUtils;
import org.apache.shiro.subject.Subject;
import org.json.JSONStringer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.ws.rs.*;
import javax.ws.rs.core.Context;
import javax.ws.rs.core.Response;
import javax.ws.rs.core.UriInfo;
import java.io.IOException;
import java.lang.reflect.Method;
import java.util.*;
import java.util.function.Predicate;

/**
 * Convenient abstract base class for PageActions. It has fields to hold values of properties specified by the
 * PageAction interface as well as other useful objects injected by the framework. It provides standard
 * implementations of many of the PageAction methods, as well as important utility methods to handle hierarchical
 * relations among pages, such as embedding.
 *
 * @author Paolo Predonzani     - paolo.predonzani@manydesigns.com
 * @author Angelo Lupo          - angelo.lupo@manydesigns.com
 * @author Giampiero Granatella - giampiero.granatella@manydesigns.com
 * @author Alessio Stalla       - alessio.stalla@manydesigns.com
 */
@RequiresPermissions(level = AccessLevel.VIEW)
public abstract class AbstractPageAction extends AbstractResourceWithParameters implements PageAction {
    public static final String copyright =
        "Copyright (C) 2005-2017 ManyDesigns srl";

    //--------------------------------------------------------------------------
    // Properties
    //--------------------------------------------------------------------------

    /** The PageInstance property. Injected. */
    public PageInstance pageInstance;
    /** The global configuration object. Injected. */
    @Autowired
    public Configuration portofinoConfiguration;
    @Autowired
    protected CodeBase codeBase;
    @Autowired
    protected ActionRegistry actionRegistry;
    @Context
    protected UriInfo uriInfo;

    //**************************************************************************
    // Scripting
    //**************************************************************************

    /**
     * The Groovy script for this page.
     */
    protected String script;

    //**************************************************************************
    // Page configuration
    //**************************************************************************

    /**
     * The context object holds various elements of contextual information such
     * as the HTTP request and response objects.
     */
    protected ActionContext context;

    //**************************************************************************
    // Logging
    //**************************************************************************

    public static final Logger logger =
            LoggerFactory.getLogger(AbstractPageAction.class);

    protected AbstractPageAction() {
        maxParameters = PageActionLogic.supportsDetail(getClass()) ? Integer.MAX_VALUE : 0;
    }

    @Override
    protected void initSubResource(Resource resource) {
        super.initSubResource(resource);
        if(resource instanceof PageAction) {
            initPageAction((PageAction) resource, getPageInstance(), uriInfo);
        }
    }

    public static void initPageAction(PageAction pageAction, PageInstance parentPageInstance, UriInfo uriInfo) {
        HttpServletRequest request = ElementsThreadLocals.getHttpServletRequest();
        HttpServletResponse response = ElementsThreadLocals.getHttpServletResponse();
        Page page;
        try {
            page = PageLogic.getPage(pageAction.getLocation());
        } catch (PageNotActiveException e) {
            logger.debug("page.xml not found or not valid", e);
            page = new Page();
            page.init();
        }
        PageInstance pageInstance = new PageInstance(
                parentPageInstance, pageAction.getLocation(), page, (Class<? extends PageAction>) pageAction.getClass());
        pageInstance.setActionBean(pageAction);
        PageLogic.configurePageAction(pageAction, pageInstance);
        ActionContext context = new ActionContext();
        context.setRequest(request);
        context.setResponse(response);
        context.setServletContext(request.getServletContext());
        if(uriInfo != null) { //TODO for Swagger
            String path = uriInfo.getPath();
            if (!path.startsWith("/")) {
                path = "/" + path;
            }
            context.setActionPath(path); //TODO
        }
        pageAction.setContext(context);
    }

    @Override
    public void prepareForExecution() {}

    @Override
    public void consumeParameter(String pathSegment) {
        super.consumeParameter(pathSegment);
        pageInstance.getParameters().add(pathSegment);
    }

    @Override
    public FileObject getChildrenLocation() throws FileSystemException {
        if(parameters.isEmpty()) {
            return getLocation();
        } else {
            return getLocation().resolveFile(PageInstance.DETAIL);
        }
    }

    @Override
    public PageAction getParent() {
        return (PageAction) super.getParent();
    }

    public String getActionPath() {
        return context.getActionPath();
    }

    //--------------------------------------------------------------------------
    // Getters/Setters
    //--------------------------------------------------------------------------

    @Override
    public PageInstance getPageInstance() {
        return pageInstance;
    }

    @Override
    public void setPageInstance(PageInstance pageInstance) {
        this.pageInstance = pageInstance;
    }

    public Page getPage() {
        return getPageInstance().getPage();
    }

    //--------------------------------------------------------------------------
    // Scripting
    //--------------------------------------------------------------------------

//    protected void prepareScript() {
//        String pageId = pageInstance.getPage().getId();
//        File file = ScriptingUtil.getGroovyScriptFile(pageInstance.getDirectory(), "action");
//        FileReader fr = null;
//        try {
//            fr = new FileReader(file);
//            script = IOUtils.toString(fr);
//        } catch (Exception e) {
//            logger.warn("Couldn't load script for page " + pageId, e);
//        } finally {
//            IOUtils.closeQuietly(fr);
//        }
//    }
//
//    protected void updateScript() {
//        File directory = pageInstance.getDirectory();
//        File groovyScriptFile = ScriptingUtil.getGroovyScriptFile(directory, "action");
//        FileWriter fw = null;
//        try {
//            fw = new FileWriter(groovyScriptFile);
//            fw.write(script);
//            fw.flush();
//            fw.close();
//            Class<?> scriptClass = PageLogic.getActionClass(portofinoConfiguration, directory, false);
//            if(scriptClass == null) {
//                SessionMessages.addErrorMessage(ElementsThreadLocals.getText("script.class.is.not.valid"));
//            }
//        } catch (IOException e) {
//            logger.error("Error writing script to " + groovyScriptFile, e);
//            String msg = ElementsThreadLocals.getText("couldnt.write.script.to._", groovyScriptFile.getAbsolutePath());
//            SessionMessages.addErrorMessage(msg);
//        } catch (Exception e) {
//            String pageId = pageInstance.getPage().getId();
//            logger.warn("Couldn't compile script for page " + pageId, e);
//            SessionMessages.addErrorMessage(ElementsThreadLocals.getText("couldnt.compile.script"));
//        } finally {
//            IOUtils.closeQuietly(fw);
//        }
//    }

    public Map getOgnlContext() {
        return ElementsThreadLocals.getOgnlContext();
    }

    public String getScript() {
        return script;
    }

    public void setScript(String script) {
        this.script = script;
    }

    public Configuration getPortofinoConfiguration() {
        return portofinoConfiguration;
    }

    @Override
    public void setContext(ActionContext context) {
        this.context = context;
    }

    @Override
    public ActionContext getContext() {
        return context;
    }

    //--------------------------------------------------------------------------
    // Utitilities
    //--------------------------------------------------------------------------

    /**
     * Returns an error response with message saying that the pageaction is not properly
     * configured.
     */
    public Response pageActionNotConfigured() {
        return Response.serverError().entity("page-action-not-configured").build();
    }

    /**
     * Returns the list of operations that can be invoked via REST on this resource.
     * @return the list of operations.
     */
    @ApiOperation(
        nickname =
            "com.manydesigns.portofino.pageactions.AbstractPageAction#describeOperations",
        value =
            "Returns the list of operations that can be invoked via REST on this resource. " +
            "If the user doesn't have permission to invoke an operation, or a VISIBLE guard " +
            "doesn't pass, then the operation is excluded from the result. If an ENABLED guard " +
            "doesn't pass, the operation is included, but it is marked as not available.")
    @ApiResponses({ @ApiResponse(
            code = 200, message = "A list of operations (name, signature, available).")})
    @Path(":operations")
    @GET
    @Produces(MimeTypes.APPLICATION_JSON_UTF8)
    public List describeOperations() {
        HttpServletRequest request = context.getRequest();
        List<Operation> operations = Operations.getOperations(getClass());
        List result = new ArrayList();
        Subject subject = SecurityUtils.getSubject();
        for(Operation operation : operations) {
            logger.trace("Operation: {}", operation);
            Method handler = operation.getMethod();
            boolean isAdmin = SecurityLogic.isAdministrator(request);
            if(!isAdmin &&
                    ((pageInstance != null && !SecurityLogic.hasPermissions(
                            portofinoConfiguration, operation.getMethod(), getClass(), pageInstance, subject)) ||
                            !SecurityLogic.satisfiesRequiresAdministrator(request, this, handler))) {
                continue;
            }
            boolean visible = Operations.doGuardsPass(this, handler, GuardType.VISIBLE);
            if(!visible) {
                continue;
            }
            boolean available = Operations.doGuardsPass(this, handler, GuardType.ENABLED);
            Map<String, Object> operationInfo = new HashMap<>();
            operationInfo.put("name", operation.getName());
            operationInfo.put("signature", operation.getSignature());
            operationInfo.put("available", available);
            result.add(operationInfo);
        }
        return result;
    }

    @Override
    protected void describe(Map<String, Object> description) {
        super.describe(description);
        description.put("page", pageInstance.getPage());
        if(PageActionLogic.supportsDetail(getClass())) {
            parameters.add("");
            description.put("detailChildren", getSubResources());
            parameters.remove(parameters.size() - 1);
        }
    }

    ////////////////
    // Configuration
    ////////////////

    /**
     * Returns the configuration of this action.
     * @return the configuration.
     */
    @ApiOperation(
        nickname =
            "com.manydesigns.portofino.pageactions.AbstractPageAction#getConfiguration",
        value =
            "Returns the configuration of this action. " +
            "The actual type of the configuration object depends on the action class.")
    @ApiResponses({ @ApiResponse(code = 200, message = "The configuration object.")})
    @Path(":configuration")
    @GET
    @Produces(MimeTypes.APPLICATION_JSON_UTF8)
    public Object getConfiguration() {
        return pageInstance.getConfiguration();
    }

    @RequiresAdministrator
    @PUT
    @Path(":configuration")
    public void setConfiguration(String configurationString) throws IOException {
        Class<?> configurationClass = PageActionLogic.getConfigurationClass(getClass());
        Object configuration = new ObjectMapper().readValue(configurationString, configurationClass);
        saveConfiguration(configuration);
    }

    /**
     * Utility method to save the configuration object to a file in this page's directory.
     * @param configuration the object to save. It must be in a state that will produce a valid XML document.
     * @return true if the object was correctly saved, false otherwise.
     */
    protected boolean saveConfiguration(Object configuration) {
        try {
            FileObject confFile = PageLogic.saveConfiguration(pageInstance.getDirectory(), configuration);
            logger.info("Configuration saved to " + confFile.getName().getPath());
            return true;
        } catch (Exception e) {
            logger.error("Couldn't save configuration", e);
            RequestMessages.addErrorMessage("error saving conf");
            return false;
        }
    }

    @GET
    @Path(":configuration/classAccessor")
    @Produces(MimeTypes.APPLICATION_JSON_UTF8)
    public String getConfigurationAccessor() {
        Class<?> configurationClass = PageActionLogic.getConfigurationClass(getClass());
        if(configurationClass == null) {
            return null;
        }
        JavaClassAccessor classAccessor = JavaClassAccessor.getClassAccessor(configurationClass);
        JSONStringer jsonStringer = new JSONStringer();
        ReflectionUtil.classAccessorToJson(classAccessor, jsonStringer);
        return jsonStringer.toString();
    }

    ////////////////
    // Configuration
    ////////////////

    @GET
    @Path(":permissions")
    @Produces(MimeTypes.APPLICATION_JSON_UTF8)
    public Map<String, Object> getActionPermissions() {
        List<Group> allGroups = new ArrayList<>(getPage().getPermissions().getGroups());
        Set<String> possibleGroups = ShiroUtils.getPortofinoRealm().getGroups();
        for(String group : possibleGroups) {
            if(allGroups.stream().noneMatch(g -> group.equals(g.getName()))) {
                Group emptyGroup = new Group();
                emptyGroup.setName(group);
                allGroups.add(emptyGroup);
            }
        }
        PageInstance parentPageInstance = getPageInstance().getParent();
        allGroups.forEach(g -> {
            if(g.getAccessLevel() == null) {
                if(parentPageInstance != null) {
                    Permissions parentPermissions =
                            SecurityLogic.calculateActualPermissions(parentPageInstance);
                    g.setActualAccessLevel(parentPermissions.getActualLevels().get(g.getName()));
                }
            }
        });
        Map<String, Object> result = new HashMap<>();
        result.put("groups", allGroups);
        result.put("permissions", getSupportedPermissions());
        return result;
    }

    @RequiresAdministrator
    @PUT
    @Path(":permissions")
    @Consumes(MimeTypes.APPLICATION_JSON_UTF8)
    public void setActionPermissions(List<Group> groups) throws Exception {
        List<Group> existingGroups = getPage().getPermissions().getGroups();
        existingGroups.clear();
        existingGroups.addAll(groups);
        FileObject saved = PageLogic.savePage(pageInstance);
        logger.info("Saved permissions to " + saved.getName().getPath());
    }

    public String[] getSupportedPermissions() {
        Class<?> actualActionClass = getPageInstance().getActionClass();
        SupportsPermissions supportsPermissions = actualActionClass.getAnnotation(SupportsPermissions.class);
        while(supportsPermissions == null && actualActionClass.getSuperclass() != Object.class) {
            actualActionClass = actualActionClass.getSuperclass();
            supportsPermissions = actualActionClass.getAnnotation(SupportsPermissions.class);
        }
        if(supportsPermissions != null && supportsPermissions.value().length > 0) {
            return supportsPermissions.value();
        } else {
            return new String[0];
        }
    }

}
